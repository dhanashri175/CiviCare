import { useState } from "react";
import { useAuth } from "../App";

export default function LoginPage() {
  const { login, setPage } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword]     = useState("");
  const [error, setError]           = useState("");
  const [loading, setLoading]       = useState(false);

  async function handleLogin() {
    if (!identifier || !password) return setError("Please enter credentials");
    setLoading(true); setError("");
    try {
      const res = await fetch("http://localhost:8000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `username=${encodeURIComponent(identifier)}&password=${encodeURIComponent(password)}`,
      });
      if (!res.ok) {
        const err = await res.json();
        // Give a helpful message if property number not found
        const detail = err.detail || "Login failed";
        if (detail === "Incorrect credentials") {
          throw new Error("Property number not found or password incorrect. Make sure you are using your municipal property tax number. If you have not applied yet, apply first to create your account.");
        }
        throw new Error(detail);
      }
      const data = await res.json();
      login(data.user, data.access_token);
      // Always go to dashboard — change password shown inline in My Portal tab
      setPage("dashboard");
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  }

  const STAFF_DEMO = [
    ["👮 Officer",     "officer@phaltan.gov.in",  "officer123"],
    ["🔧 Plumber",     "plumber1@phaltan.gov.in", "plumber123"],
    ["🏛️ Corporator", "corp1@phaltan.gov.in",    "corp123"],
  ];

  const CITIZEN_DEMO = [
    ["PMC/W1/0001", "Ramesh Jadhav"],
    ["PMC/W2/0005", "Sunita More"],
    ["PMC/W3/0012", "Ganesh Shinde"],
    ["PMC/W4/0008", "Priya Kulkarni"],
    ["PMC/W13/022", "Raju Kale"],
    ["PMC/W5/0003", "Meera Pawar"],
    ["PMC/W6/0017", "Anil Desai"],
    ["PMC/W7/0009", "Lata Patil"],
  ];

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div style={{textAlign:"center",marginBottom:20}}>
          <div style={{fontSize:40,marginBottom:8}}>💧</div>
          <h2>Login to CiviCare</h2>
          <p className="auth-subtitle">Phaltan Municipal Council — Water Portal</p>
        </div>

        {/* How citizen login works */}
        <div style={{background:"rgba(59,130,246,0.06)",border:"1px solid rgba(59,130,246,0.2)",
          borderRadius:10,padding:12,marginBottom:16,fontSize:12,color:"var(--stone-600)"}}>
          <div style={{fontWeight:700,marginBottom:6,color:"var(--blue-700)"}}>ℹ️ How citizen login works</div>
          <div>• <strong>Apply</strong> using your property tax number — your account is created instantly</div>
          <div>• <strong>Log in immediately</strong> with your property number to track your application</div>
          <div>• Once the officer activates your connection, your bills will appear here</div>
          <div style={{marginTop:6,padding:"6px 8px",background:"rgba(59,130,246,0.08)",borderRadius:6}}>
            Haven't applied yet?{" "}
            <span style={{color:"var(--amber-600)",cursor:"pointer",fontWeight:600,textDecoration:"underline"}}
              onClick={()=>setPage("apply")}>Apply for connection →</span>
          </div>
        </div>

        {error && (
          <div className="error-box" style={{marginBottom:14}}>
            {error}

          </div>
        )}

        <div className="form-group">
          <label>Property Number / Email</label>
          <input value={identifier} onChange={e=>setIdentifier(e.target.value)}
            placeholder="PMC/W1/0001 or officer@phaltan.gov.in"
            onKeyDown={e=>e.key==="Enter"&&handleLogin()} autoComplete="username" />
          <div style={{fontSize:11,color:"var(--stone-400)",marginTop:4}}>
            🏠 Citizens: property number &nbsp;|&nbsp; 👮 Staff: email
          </div>
        </div>

        <div className="form-group">
          <label>Password</label>
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)}
            placeholder="••••••••" onKeyDown={e=>e.key==="Enter"&&handleLogin()} autoComplete="current-password" />
          <div style={{fontSize:11,color:"var(--stone-400)",marginTop:4}}>
            First login: password = your property number
          </div>
        </div>

        <button className="btn-primary full-width" onClick={handleLogin} disabled={loading}>
          {loading ? "Logging in..." : "🔑 Login"}
        </button>

        <div style={{display:"flex",gap:12,marginTop:14}}>
          <button className="btn-secondary" style={{flex:1,fontSize:13}}
            onClick={()=>setPage("apply")}>🔌 Apply for connection</button>
          <button className="btn-secondary" style={{flex:1,fontSize:13}}
            onClick={()=>setPage("track")}>📋 Track application</button>
        </div>

        {/* Staff demo */}
        <div style={{marginTop:18,background:"var(--amber-50)",border:"1px solid var(--amber-200)",
          borderRadius:12,padding:12}}>
          <div style={{fontSize:11,fontWeight:700,color:"var(--amber-700)",marginBottom:8}}>
            👮 STAFF — click to fill:
          </div>
          {STAFF_DEMO.map(([label, u, p]) => (
            <div key={label} onClick={()=>{setIdentifier(u);setPassword(p);}}
              style={{fontSize:12,padding:"5px 8px",borderRadius:8,cursor:"pointer",
                color:"var(--stone-600)",display:"flex",justifyContent:"space-between"}}
              onMouseEnter={e=>e.currentTarget.style.background="var(--amber-100)"}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <span>{label}</span>
              <code style={{color:"var(--amber-700)",fontSize:11}}>{u}</code>
            </div>
          ))}
        </div>

        {/* Citizens demo — only shown for seeded demo accounts */}
        <div style={{marginTop:10,background:"rgba(59,130,246,0.05)",
          border:"1px solid rgba(59,130,246,0.2)",borderRadius:12,padding:12}}>
          <div style={{fontSize:11,fontWeight:700,color:"var(--blue-600)",marginBottom:4}}>
            🏠 DEMO CITIZENS (active connections in DB):
          </div>
          <div style={{fontSize:10,color:"var(--stone-400)",marginBottom:8}}>
            Password = property number for all demo accounts
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4}}>
            {CITIZEN_DEMO.map(([prop, name]) => (
              <div key={prop} onClick={()=>{setIdentifier(prop);setPassword(prop);}}
                style={{fontSize:11,padding:"4px 8px",borderRadius:6,cursor:"pointer",color:"var(--stone-600)"}}
                onMouseEnter={e=>e.currentTarget.style.background="rgba(59,130,246,0.08)"}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <code style={{color:"var(--blue-600)",fontSize:10}}>{prop}</code>
                <div style={{fontSize:10,color:"var(--stone-400)"}}>{name}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
