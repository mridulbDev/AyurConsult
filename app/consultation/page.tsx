"use client";
import { useEffect } from "react";
import Cal, { getCalApi } from "@calcom/embed-react";
import { ShieldCheck, Clock, Stethoscope, CheckCircle2, CreditCard } from "lucide-react";

export default function ConsultationPage() {
  
  useEffect(() => {
    (async function () {
      // Using your specific namespace
      const cal = await getCalApi({"namespace":"consultation"});
      cal("ui", {
        "hideEventTypeDetails": false,
        "layout": "month_view",
        "theme": "light",
        "styles": { "branding": { "brandColor": "#1b4332" } }
      });
    })();
  }, []);

  return (
    <div className="min-h-screen bg-[#fdf6e3]">
      {/* 1. HERO HEADER */}
      <section className="relative bg-forest pt-24 pb-40 overflow-hidden text-center text-sand px-6">
        <div className="relative z-10 max-w-3xl mx-auto space-y-4">
          <div className="badge-vedic !bg-saffron/20 !text-saffron border-saffron/30 mx-auto w-fit">
            Expert Ayurvedic Surgical Guidance
          </div>
          <h1 className="text-4xl md:text-6xl font-serif font-bold tracking-tight">
            Consult with <span className="text-saffron">Prof. Mahesh Dixit</span>
          </h1>
          <p className="text-lg opacity-80 leading-relaxed">
            Choose your preferred time and location (Online/Clinic) within the booking form below.
          </p>
        </div>
        <div className="absolute top-0 right-0 opacity-5 pointer-events-none translate-x-1/3 -translate-y-1/3">
           <Stethoscope size={600} />
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-6 -mt-24 relative z-20">
        <div className="grid lg:grid-cols-12 gap-8 items-start">
          
          {/* 2. LEFT SIDE: CLINIC DETAILS & INFO */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white rounded-[32px] p-8 shadow-xl border border-forest/5">
              <h3 className="text-xl font-bold text-forest mb-6 flex items-center gap-2">
                <CheckCircle2 className="text-saffron" /> Consultation Steps
              </h3>
              <ul className="space-y-4">
                {[
                  { t: "Pick Time & Mode", d: "Select Online or In-Person during booking." },
                  { t: "Secure Payment", d: "Redirect to Razorpay to confirm your slot." },
                  { t: "Preparation", d: "Instructions will be sent to your email." },
                  { t: "Consultation", d: "Join the video call or visit the clinic." }
                ].map((item, i) => (
                  <li key={i} className="flex gap-4">
                    <div className="h-6 w-6 rounded-full bg-sand flex items-center justify-center text-saffron font-bold text-xs shrink-0">
                      {i + 1}
                    </div>
                    <div>
                      <p className="font-bold text-sm text-forest leading-none mb-1">{item.t}</p>
                      <p className="text-xs text-forest/60">{item.d}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-forest text-sand rounded-[32px] p-8 shadow-xl relative overflow-hidden group">
              <div className="relative z-10">
                <CreditCard className="mb-4 text-saffron" size={32} />
                <h4 className="text-lg font-bold mb-2">Payment Info</h4>
                <p className="text-sm opacity-70">Please complete the payment on the following screen to finalize the appointment.</p>
                <div className="mt-6 pt-6 border-t border-white/10">
                  <p className="text-xs uppercase tracking-widest text-saffron font-bold">Inquiries</p>
                  <p className="text-sm mt-1">support@drmaheshdixit.com</p>
                </div>
              </div>
            </div>
          </div>

          {/* 3. RIGHT SIDE: THE CALENDAR */}
          <div className="lg:col-span-8">
            <div className="bg-white rounded-[40px] shadow-2xl border-4 border-white overflow-hidden min-h-[700px]">
               <div className="p-6 bg-sand/30 border-b border-forest/5 flex justify-between items-center">
                  <h4 className="text-lg font-bold text-forest">Select Appointment Time</h4>
                  <ShieldCheck className="text-saffron" size={28} />
               </div>
              
              <div className="h-full">
                <Cal 
                  namespace="consultation"
                  calLink="mridul-fcxprd/consultation"
                  style={{width:"100%", height:"700px", overflow:"scroll"}}
                  config={{"layout":"month_view"}}
                />
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}