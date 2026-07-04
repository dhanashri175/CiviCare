import { useState } from "react";

const TOURS = {
  citizen: [
    { emoji:"💧", title:"Welcome to CiviCare!", titleMr:"सिविकेअरमध्ये आपले स्वागत!",
      body:"Your smart water management portal for Phaltan Municipal Council. Let us show you around in 4 quick steps.",
      bodyMr:"फलटण नगरपालिकेचे स्मार्ट जल व्यवस्थापन पोर्टल. ४ सोप्या चरणांमध्ये पाहूया." },
    { emoji:"🏠", title:"Home Tab — Your supply status",  titleMr:"मुख्यपृष्ठ — पाणीपुरवठा स्थिती",
      body:"See today's water supply status, your 30-day supply score, and all announcements from the municipal office.",
      bodyMr:"आजचा पाणीपुरवठा स्थिती, ३० दिवसांचा स्कोर आणि सर्व घोषणा पहा." },
    { emoji:"💰", title:"Bills — Download & AI Explainer", titleMr:"बिले — डाउनलोड करा",
      body:"View your annual water bill, download a PDF receipt, and tap '🤖 Explain My Bill' for a plain-language breakdown in Marathi or Hindi.",
      bodyMr:"वार्षिक पाणी बिल पहा, PDF डाउनलोड करा आणि मराठीत स्पष्टीकरण मिळवा." },
    { emoji:"📋", title:"Complaints — Speak it out!", titleMr:"तक्रारी — बोलून सांगा!",
      body:"File complaints by typing or tap 🎤 to speak in Marathi. We auto-detect duplicate complaints in your ward so you always know the status.",
      bodyMr:"टाइप करून किंवा 🎤 दाबून मराठीत बोला. आम्ही डुप्लीकेट तक्रारी आपोआप शोधतो." },
  ],
  officer: [
    { emoji:"👮", title:"Welcome, Officer!", titleMr:"अधिकारी, स्वागत आहे!",
      body:"Your AI-powered command centre for Phaltan's water network. Here's what's new in v4.",
      bodyMr:"फलटणच्या जल नेटवर्कसाठी तुमचे AI-संचालित नियंत्रण केंद्र." },
    { emoji:"⚠️", title:"Fault Alerts — AI detects problems", titleMr:"दोष अलर्ट",
      body:"The system automatically clusters complaints by ward and type. When a threshold is crossed, you get a real-time fault alert with an AI-generated summary.",
      bodyMr:"प्रणाली वॉर्डनुसार तक्रारी आपोआप गटबद्ध करते आणि AI अलर्ट पाठवते." },
    { emoji:"📢", title:"Announcements — AI + SMS", titleMr:"घोषणा — AI + SMS",
      body:"Click '✨ AI Suggestion' to auto-generate announcement text based on complaint trends. Then tick 'Send SMS' to push it to all citizens in the ward.",
      bodyMr:"AI सूचना मिळवा आणि SMS द्वारे नागरिकांना पाठवा." },
    { emoji:"🏔️", title:"Veer Dam — Live data", titleMr:"वीर धरण — थेट डेटा",
      body:"Dam level is fetched from CWC (data.gov.in) daily. Add your API key in .env to get real data — otherwise a realistic seasonal estimate is shown.",
      bodyMr:"CWC कडून रोज धरण पातळी मिळते. API की .env मध्ये जोडा." },
  ],
  plumber: [
    { emoji:"🔧", title:"Welcome, Plumber!", titleMr:"प्लंबर, स्वागत!",
      body:"Your portal shows only complaints assigned to you by the officer. Nothing else — clean and focused.",
      bodyMr:"फक्त तुम्हाला नियुक्त केलेल्या तक्रारी दिसतात." },
    { emoji:"▶️", title:"Start → Resolve", titleMr:"सुरू करा → निराकरण करा",
      body:"Tap 'Start Work' when you begin, then 'Mark Resolved' with a resolution note when done. The officer sees updates in real-time.",
      bodyMr:"'Start Work' दाबा, काम झाल्यावर 'Mark Resolved' दाबा आणि नोट लिहा." },
  ],
  corporator: [
    { emoji:"🏛️", title:"Welcome, Corporator!", titleMr:"नगरसेवक, स्वागत!",
      body:"Your ward's live data — complaints, supply history, and dam level — all in one place.",
      bodyMr:"तुमच्या वॉर्डचा थेट डेटा — तक्रारी, पुरवठा आणि धरण पातळी." },
    { emoji:"📊", title:"Ward transparency", titleMr:"वॉर्ड पारदर्शकता",
      body:"Resolution rates, average fix times, and top complaint types are visible to citizens on the public dashboard. Your ward's performance is public.",
      bodyMr:"निराकरण दर, वेळ आणि शीर्ष तक्रार प्रकार सार्वजनिक दिसतात." },
  ],
};

export default function OnboardingTour({ role, onFinish, lang }) {
  const steps = TOURS[role] || TOURS.citizen;
  const [step, setStep] = useState(0);
  const isMr = lang === "mr";
  const current = steps[step];

  function next() {
    if (step < steps.length - 1) setStep(s => s + 1);
    else onFinish();
  }

  return (
    <div className="tour-overlay" onClick={e => { if(e.target===e.currentTarget) onFinish(); }}>
      <div className="tour-card">
        <span className="tour-emoji">{current.emoji}</span>
        <h2>{isMr && current.titleMr ? current.titleMr : current.title}</h2>
        <p>{isMr && current.bodyMr ? current.bodyMr : current.body}</p>

        {/* Step dots */}
        <div className="tour-dots">
          {steps.map((_, i) => (
            <div key={i} className={`tour-dot ${i === step ? "active" : ""}`}
              onClick={() => setStep(i)} style={{cursor:"pointer"}} />
          ))}
        </div>

        <div className="tour-actions">
          <span className="tour-skip" onClick={onFinish}>
            {isMr ? "वगळा" : "Skip tour"}
          </span>
          <div style={{display:"flex",gap:8}}>
            {step > 0 && (
              <button className="btn-secondary" style={{padding:"8px 16px",fontSize:13}}
                onClick={() => setStep(s => s - 1)}>
                {isMr ? "मागे" : "← Back"}
              </button>
            )}
            <button className="btn-primary" onClick={next}>
              {step < steps.length - 1
                ? (isMr ? "पुढे →" : "Next →")
                : (isMr ? "सुरू करा 🚀" : "Get Started 🚀")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
