"use client";
import React, { useState, useEffect,Suspense } from 'react';
import { useLanguage } from '@/app/context/LanguageContext';
import { Clock, CreditCard, Video, ShieldCheck, CheckCircle2, Leaf, Calendar as CalIcon, ChevronRight } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import Script from 'next/script';

function ConsultationContent() {
  const { lang } = useLanguage();
  const searchParams = useSearchParams();
  const rescheduleId = searchParams.get('reschedule');

  // --- LOGIC STATES ---
  const [step, setStep] = useState(1); 
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [slots, setSlots] = useState<any[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', age: '', history: '', symptoms: '' });
   
  // Detect if user is returning from a successful Razorpay payment
  useEffect(() => {
    if (searchParams.get('success') === 'true') {
      setStep(3);
    }
  }, [searchParams]);
  // Fetch slots from your Google Calendar API
  useEffect(() => {
    async function fetchSlots() {
      setLoading(true);
      const res = await fetch(`/api/consultation?date=${selectedDate}`);
      const data = await res.json();
      setSlots(data.slots || []);
      setLoading(false);
    }
    fetchSlots();
  }, [selectedDate]);

  const handleProceed = async () => {
    if (step === 1) return setStep(2);
    setLoading(true);

    try {
      const res = await fetch('/api/consultation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: selectedSlot.id, patientData: formData, rescheduleId })
      });

      const data = await res.json();

      if (rescheduleId) {
        setStep(3);
      } else {
        // TRIGGER RAZORPAY SDK
        const options = {
          key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
          amount: 20000,
          currency: "INR",
          name: "Dr. Dixit Ayurveda",
          description: "Consultation Fee",
          order_id: data.orderId,
          handler: function (response: any) {
            // This runs after successful payment
            setStep(3); 
          },
          prefill: {
            name: formData.name,
            email: formData.email,
            contact: formData.phone,
          },
          theme: { color: "#123025" }, // Forest Green
        };

        const rzp = new (window as any).Razorpay(options);
        rzp.open();
      }
    } catch (e) {
      console.error("FULL ERROR DETAILS:", e); // Look at your browser console (F12)
      alert("Error: " + e);
    } finally {
      setLoading(false);
    }
  };

  const steps = [
    {
      icon: <Clock size={22} className="text-saffron" />,
      title: lang === 'en' ? 'Pick a Timeslot' : 'समय चुनें',
      desc: lang === 'en' ? 'Select a convenient date and time from the live calendar.' : 'लाइव कैलेंडर से अपनी सुविधा अनुसार तारीख और समय चुनें।'
    },
    {
      icon: <CreditCard size={22} className="text-saffron" />,
      title: lang === 'en' ? 'Secure Payment' : 'सुरक्षित भुगतान',
      desc: lang === 'en' ? 'Complete your booking via Razorpay secure gateway.' : 'रेज़रपे सुरक्षित गेटवे के माध्यम से अपनी बुकिंग पूरी करें।'
    },
    {
      icon: <Video size={22} className="text-saffron" />,
      title: lang === 'en' ? 'Join the Session' : 'सत्र में शामिल हों',
      desc: lang === 'en' ? 'Receive a meeting link via Email/WhatsApp for your call.' : 'कॉल के लिए ईमेल/व्हाट्सएप के माध्यम से मीटिंग लिंक प्राप्त करें।'
    }
  ];

  return (
   <>
    <Script src="https://checkout.razorpay.com/v1/checkout.js" />
     <div className="min-h-screen bg-sand relative overflow-hidden selection:bg-saffron/30">
      {/* --- DYNAMIC BACKGROUND ELEMENTS --- */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-5%] left-[-5%] w-[500px] h-[500px] bg-forest/10 rounded-full blur-[100px] animate-pulse"></div>
        <div className="absolute bottom-[10%] right-[-5%] w-[400px] h-[400px] bg-saffron/5 rounded-full blur-[80px]"></div>
        <Leaf className="absolute top-40 right-20 text-forest/10 rotate-[30deg]" size={100} />
      </div>

      {/* --- 1. HERO SECTION --- */}
      <div className="bg-forest pt-32 md:pt-48 pb-32 md:pb-40 px-6 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.05] mix-blend-overlay pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/natural-paper.png')]"></div>
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/dust.png')]"></div>
        
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start gap-12 md:gap-16 relative z-10">
          <div className="md:w-1/2 text-left">
            <span className="text-saffron text-xs font-bold tracking-[0.5em] uppercase mb-6 block">
              {lang === 'en' ? 'Authentic Healing' : 'प्रामाणिक चिकित्सा'}
            </span>
            <h1 className="text-4xl md:text-7xl font-serif font-bold leading-[1.15]">
              {lang === 'en' ? (
                <>
                  <span className="text-sand">Start Your </span>
                  <span className="text-saffron">Journey</span> <br/>
                  <span className="text-sand">of Natural </span>
                  <span className="text-saffron">Healing</span>
                </>
              ) : (
                <>
                  <span className="text-sand">प्राकृतिक </span>
                  <span className="text-saffron">चिकित्सा</span> <br/>
                  <span className="text-sand">की </span>
                  <span className="text-saffron">शुरुआत</span>
                </>
              )}
            </h1>
          </div>

          <div className="md:w-1/2 text-left md:border-l border-sand/10 md:pl-16">
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-serif leading-snug mb-6 md:mb-8">
              <span className="text-sand">Dr. Dixit </span>
              <span className="text-saffron italic">Ayurveda</span>
            </h2>
            <p className="text-sand/70 text-base md:text-lg font-light mb-8 max-w-md leading-relaxed">
              {lang === 'en' 
                ? "Specialized Ayurvedic consultation providing personalized wellness and holistic healing expertise."
                : "विशेष आयुर्वेदिक परामर्श जो व्यक्तिगत कल्याण और समग्र उपचार विशेषज्ञता प्रदान करता है।"}
            </p>
            <div className="flex gap-4 items-center">
              <div className="w-16 h-[1px] bg-saffron"></div>
              <p className="text-saffron text-[10px] font-bold tracking-[0.3em] uppercase">
                {lang === 'en' ? 'Select booking timing below' : 'नीचे बुकिंग का समय चुनें'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* --- 2. BOOKING CONSOLE --- */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 -mt-20 md:-mt-24 mb-24 relative z-30">
        <div className="relative flex flex-col lg:flex-row min-h-[600px] md:min-h-[750px] rounded-2xl md:rounded-r-[48px] overflow-hidden shadow-[0_60px_100px_-20px_rgba(18,48,37,0.4)] border border-forest/20 group">
          
          {/* Left Column: Step Guide */}
          <div className="lg:w-[35%] bg-forest p-8 md:p-14 text-sand relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-2.5 bg-saffron" />
            <div className="relative z-10 h-full flex flex-col">
              <h4 className="text-saffron font-bold uppercase tracking-widest text-[10px] mb-8 md:mb-12 flex items-center gap-3">
                <div className="w-2 h-2 bg-saffron rounded-full animate-ping"></div>
                <ShieldCheck size={16} /> {lang === 'en' ? 'Booking Steps' : 'बुकिंग चरण'}
              </h4>

              <div className="space-y-8 md:space-y-12">
                {steps.map((stepItem, idx) => (
                  <div key={idx} className={`flex gap-4 md:gap-6 items-start group/item transition-opacity ${step > idx + 1 ? 'opacity-30' : 'opacity-100'}`}>
                    <div className="w-12 h-12 md:w-14 md:h-14 bg-sand/5 rounded-xl md:rounded-2xl flex items-center justify-center shrink-0 border border-sand/10 group-hover/item:border-saffron/50 transition-all duration-500 shadow-inner">
                      {stepItem.icon}
                    </div>
                    <div>
                      <h5 className="font-bold text-sand text-base md:text-lg mb-1 md:mb-2 group-hover/item:text-saffron transition-colors">{stepItem.title}</h5>
                      <p className="text-xs text-sand/50 leading-relaxed font-light">{stepItem.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-12 lg:mt-auto pt-8 border-t border-white/5">
                 <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3 text-xs text-sand/60">
                       <CheckCircle2 size={14} className="text-saffron" />
                       {lang === 'en' ? 'Secure Razorpay Checkout' : 'सुरक्षित रेज़रपे चेकआउट'}
                    </div>
                    <p className="text-[10px] text-sand/30 italic leading-relaxed">
                      {lang === 'en' ? 'Confirmation sent instantly to Email/WhatsApp.' : 'ईमेल/व्हाट्सएप पर तुरंत पुष्टि भेजी गई।'}
                    </p>
                 </div>
              </div>
            </div>
          </div>

          {/* Right Column: Interactive Selection (Replacing Iframe) */}
          <div className="flex-1 bg-sand/60 backdrop-blur-2xl relative min-h-[500px] md:h-auto overflow-y-auto">
            <div className="absolute inset-0 opacity-[0.04] pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/graphy-dark.png')]"></div>
            
            <div className="relative z-10 p-6 md:p-12 h-full flex flex-col justify-center">
              
              {/* STEP 1: DATE & TIME */}
              {step === 1 && (
                <div className="space-y-8 animate-in fade-in duration-500">
                  <div className="space-y-3">
                    <label className="text-forest font-serif text-xl flex items-center gap-2"><CalIcon size={20} className="text-saffron"/> {lang === 'en' ? '1. Choose Date' : '१. तारीख चुनें'}</label>
                    <input type="date" min={new Date().toISOString().split('T')[0]} value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="w-full p-4 rounded-xl border border-forest/10 bg-white/50 outline-none" />
                  </div>

                  <div className="space-y-3">
                    <label className="text-forest font-serif text-xl flex items-center gap-2"><Clock size={20} className="text-saffron"/> {lang === 'en' ? '2. Available Slots' : '२. उपलब्ध समय'}</label>
                    {loading ? <p className="animate-pulse text-forest/40">Fetching Dr. Dixit's availability...</p> : 
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {slots.map(s => (
                          <button key={s.id} onClick={() => setSelectedSlot(s)} className={`p-4 rounded-xl border font-bold transition-all ${selectedSlot?.id === s.id ? 'bg-forest text-saffron border-forest' : 'bg-white/40 border-forest/10 hover:border-saffron'}`}>
                            {new Date(s.start.dateTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                          </button>
                        ))}
                      </div>
                    }
                  </div>
                  <button disabled={!selectedSlot} onClick={() => setStep(2)} className="w-full py-4 bg-forest text-sand rounded-xl font-bold uppercase disabled:opacity-20 flex items-center justify-center gap-2">
                    {lang === 'en' ? 'Enter Details' : 'विवरण भरें'} <ChevronRight size={20}/>
                  </button>
                </div>
              )}

              {/* STEP 2: FORM */}
              {step === 2 && (
                <div className="space-y-4 animate-in slide-in-from-right duration-500">
                  <h3 className="text-2xl font-serif text-forest mb-4">{lang === 'en' ? 'Patient Details' : 'रोगी का विवरण'}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input placeholder="Name" className="p-4 rounded-xl border bg-white/50" onChange={e => setFormData({...formData, name: e.target.value})} />
                    <input placeholder="Email" className="p-4 rounded-xl border bg-white/50" onChange={e => setFormData({...formData, email: e.target.value})} />
                    <input placeholder="Phone" className="p-4 rounded-xl border bg-white/50" onChange={e => setFormData({...formData, phone: e.target.value})} />
                    <input placeholder="Age" className="p-4 rounded-xl border bg-white/50" onChange={e => setFormData({...formData, age: e.target.value})} />
                  </div>
                  <textarea placeholder="Medical History" className="w-full p-4 rounded-xl border bg-white/50 h-24" onChange={e => setFormData({...formData, history: e.target.value})} />
                  <textarea placeholder="Current Symptoms" className="w-full p-4 rounded-xl border bg-white/50 h-24" onChange={e => setFormData({...formData, symptoms: e.target.value})} />
                  <div className="flex gap-4">
                    <button onClick={() => setStep(1)} className="flex-1 py-4 border border-forest rounded-xl font-bold uppercase">{lang === 'en' ? 'Back' : 'पीछे'}</button>
                    <button onClick={handleProceed} className="flex-[2] py-4 bg-saffron text-forest rounded-xl font-bold uppercase shadow-lg">
                      {loading ? '...' : (rescheduleId ? (lang === 'en' ? 'Confirm Move' : 'पुष्टि करें') : (lang === 'en' ? 'Pay & Book' : 'भुगतान और बुकिंग'))}
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 3: SUCCESS */}
              {step === 3 && (
                <div className="text-center space-y-6 animate-in zoom-in duration-500">
                  <CheckCircle2 size={80} className="text-forest mx-auto" />
                  <h2 className="text-4xl font-serif text-forest">{lang === 'en' ? 'Success!' : 'सफल!'}</h2>
                  <p className="text-forest/60">{lang === 'en' ? 'Meeting link sent to your Email & WhatsApp.' : 'मीटिंग लिंक आपके ईमेल और व्हाट्सएप पर भेज दिया गया है।'}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div> 
   </>
  );
}

// 3. Export the Page wrapped in Suspense
export default function ConsultationPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-sand flex items-center justify-center">
        <div className="animate-pulse text-forest font-serif text-xl">
          Loading Ayurvedic Console...
        </div>
      </div>
    }>
      <ConsultationContent />
    </Suspense>
  );
}