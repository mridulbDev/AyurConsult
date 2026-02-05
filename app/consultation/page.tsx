"use client";
import React, { useState, useEffect, Suspense } from 'react';
import { useLanguage } from '@/app/context/LanguageContext';
import { Clock, CreditCard, Video, ShieldCheck, CheckCircle2, Leaf, Calendar as CalIcon, ChevronRight, AlertCircle } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import Script from 'next/script';

function ConsultationContent() {
  const { lang } = useLanguage();
  const searchParams = useSearchParams();
  const rescheduleId = searchParams.get('reschedule') || null;

  // --- LOGIC STATES ---
  const [step, setStep] = useState(1);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [slots, setSlots] = useState<any[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', age: '', history: '', symptoms: '' });

  // --- VALIDATION LOGIC ---
  const isEmailValid = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const isPhoneValid = (phone: string) => /^[6-9]\d{9}$/.test(phone.replace(/\s+/g, ''));
  const isAgeValid = (age: string) => {
    const n = parseInt(age);
    return !isNaN(n) && n > 0 && n < 120;
  };

  const isFormValid = 
    formData.name.trim().length > 1 &&
    isEmailValid(formData.email) &&
    isPhoneValid(formData.phone) &&
    isAgeValid(formData.age) &&
    formData.symptoms.trim().length > 2;

  useEffect(() => {
    if (searchParams.get('success') === 'true') {
      setStep(3);
    }
  }, [searchParams]);

  useEffect(() => {
    async function fetchOldBookingDetails() {
      if (!rescheduleId) return;
      try {
        const res = await fetch(`/api/consultation?bookingId=${rescheduleId}`);
        const data = await res.json();
        
        if (data.details) {
          const prev = data.details;
          setFormData({
            name: prev.name || '',
            email: prev.email || '',
            phone: prev.phone || '',
            age: prev.age || '',
            history: prev.history || '',
            symptoms: prev.symptoms || ''
          });
        }
      } catch (e) {
        console.error("Failed to fetch previous booking data:", e);
      }
    }
    fetchOldBookingDetails();
  }, [rescheduleId]);

  useEffect(() => {
    async function fetchSlots() {
      setLoading(true);
      try {
        const res = await fetch(`/api/consultation?date=${selectedDate}`);
        const data = await res.json();
        setSlots(data.slots || []);
      } catch (e) {
        console.error("Fetch slots error:", e);
      } finally {
        setLoading(false);
      }
    }
    fetchSlots();
  }, [selectedDate]);

  const handleProceed = async () => {
    if (step === 1) return setStep(2);
    if (!isFormValid) return;
    setLoading(true);

    try {
      const res = await fetch('/api/consultation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          eventId: selectedSlot.id, 
          patientData: formData, 
          rescheduleId
        })
      });

      const data = await res.json();

      // 🚩 CRITICAL: Handle the 400 error (One-time reschedule limit)
      if (!res.ok) {
        alert(data.error || "Something went wrong. Please check your details.");
        setLoading(false);
        return;
      }

      if (rescheduleId) {
        // Successful Reschedule skips payment
        setStep(3);
      } else {
        // Normal Flow: Open Razorpay
        const options = {
          key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "",
          amount: Number(process.env.NEXT_PUBLIC_RAZORPAY_AMOUNT),
          currency: "INR",
          name: "Dr. Dixit Ayurveda",
          description: "Consultation Fee",
      
          order_id: data.orderId,
          handler: function (response: any) {
            setStep(3);
          },
          prefill: {
            name: formData.name,
            email: formData.email,
            contact: formData.phone,
          },
          theme: { color: "#123025" },
        };
        const rzp = new (window as any).Razorpay(options);
        rzp.open();
      }
    } catch (e) {
      alert("Network error. Please check your connection.");
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
        <div className="absolute inset-0 z-0 pointer-events-none">
          <div className="absolute top-[-5%] left-[-5%] w-[500px] h-[500px] bg-forest/10 rounded-full blur-[100px] animate-pulse"></div>
          <div className="absolute bottom-[10%] right-[-5%] w-[400px] h-[400px] bg-saffron/5 rounded-full blur-[80px]"></div>
         
        </div>

        <div className="bg-forest pt-32 md:pt-48 pb-32 md:pb-40 px-6 relative overflow-hidden">
          <div className="absolute inset-0 opacity-[0.05] mix-blend-overlay pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/natural-paper.png')]"></div>
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start gap-12 md:gap-16 relative z-10">
            <div className="md:w-1/2 text-left">
              <span className="text-saffron text-xs font-bold tracking-[0.5em] uppercase mb-6 block">
                {lang === 'en' ? 'Authentic Healing' : 'प्रामाणिक चिकित्सा'}
              </span>
              <h1 className="text-4xl md:text-7xl font-serif font-bold leading-[1.15]">
                {lang === 'en' ? (
                  <>
                    <span className="text-sand">Start Your </span>
                    <span className="text-saffron">Journey</span> <br />
                    <span className="text-saffron">of Natural </span>
                    <span className="text-sand">Healing</span>
                  </>
                ) : (
                  <>
                    <span className="text-sand">प्राकृतिक </span>
                    <span className="text-saffron">चिकित्सा</span> <br />
                    <span className="text-saffron">की </span>
                    <span className="text-sand">शुरुआत</span>
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
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 md:px-6 -mt-20 md:-mt-24 mb-24 relative z-30">
          <div className="relative flex flex-col lg:flex-row min-h-[600px] md:min-h-[750px] rounded-2xl md:rounded-r-[48px] overflow-hidden shadow-[0_60px_100px_-20px_rgba(18,48,37,0.4)] border border-forest/20 group">

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
              </div>
            </div>

            <div className="flex-1 bg-sand/60 backdrop-blur-2xl relative min-h-[500px] md:h-auto overflow-y-auto">
              <div className="relative z-10 p-6 md:p-12 h-full flex flex-col justify-center">

                {step === 1 && (
                  <div className="space-y-8 animate-in fade-in duration-500">
                    <div className="space-y-3">
                      <label className="text-forest font-serif text-xl flex items-center gap-2"><CalIcon size={20} className="text-saffron" /> {lang === 'en' ? '1. Choose Date' : '१. तारीख चुनें'}</label>
                      <input type="date" min={new Date().toISOString().split('T')[0]} value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="w-full p-4 rounded-xl border border-forest/10 bg-white/50 outline-none" />
                    </div>
                    <div className="space-y-3">
                      <label className="text-forest font-serif text-xl flex items-center gap-2"><Clock size={20} className="text-saffron" /> {lang === 'en' ? '2. Available Slots' : '२. उपलब्ध समय'}</label>
                      {loading ? <p className="animate-pulse text-forest/40">Fetching availability...</p> :
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          {slots.length > 0 ? slots.map(s => (
                            <button key={s.id} onClick={() => setSelectedSlot(s)} className={`p-4 rounded-xl border font-bold transition-all ${selectedSlot?.id === s.id ? 'bg-forest text-saffron border-forest' : 'bg-white/40 border-forest/10 hover:border-saffron'}`}>
                              {new Date(s.start.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </button>
                          )) : <p className="col-span-full text-forest/40 italic">No slots available.</p>}
                        </div>
                      }
                    </div>
                    <button disabled={!selectedSlot} onClick={() => setStep(2)} className="w-full py-4 bg-forest text-sand rounded-xl font-bold uppercase disabled:opacity-20 flex items-center justify-center gap-2">
                      {lang === 'en' ? 'Enter Details' : 'विवरण भरें'} <ChevronRight size={20} />
                    </button>
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-4 animate-in slide-in-from-right duration-500">
                    <h3 className="text-2xl font-serif text-forest mb-4">{lang === 'en' ? 'Patient Details' : 'रोगी का विवरण'}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <input placeholder="Full Name" className="p-4 rounded-xl border bg-white/50 outline-none focus:border-saffron" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                      <input placeholder="Email Address" type="email" className="p-4 rounded-xl border bg-white/50 outline-none focus:border-saffron" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                      <div className="relative flex items-center">
                        <span className="absolute left-4 text-forest/50 font-bold">+91</span>
                        <input placeholder="Phone Number" className="w-full p-4 pl-14 rounded-xl border bg-white/50 outline-none" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value.replace(/\D/g, '') })} />
                      </div>
                      <input placeholder="Age" className="p-4 rounded-xl border bg-white/50 outline-none" value={formData.age} onChange={e => setFormData({ ...formData, age: e.target.value.replace(/\D/g, '') })} />
                    </div>
                    <textarea placeholder="Medical History (Optional)" className="w-full p-4 rounded-xl border bg-white/50 h-20 outline-none" value={formData.history} onChange={e => setFormData({ ...formData, history: e.target.value })} />
                    <textarea placeholder="Current Symptoms" className="w-full p-4 rounded-xl border bg-white/50 h-20 outline-none" value={formData.symptoms} onChange={e => setFormData({ ...formData, symptoms: e.target.value })} />
                    <div className="flex gap-4 pt-4">
                      <button onClick={() => setStep(1)} className="flex-1 py-4 border border-forest rounded-xl font-bold uppercase hover:bg-forest/5 transition-colors">{lang === 'en' ? 'Back' : 'पीछे'}</button>
                      <button disabled={!isFormValid || loading} onClick={handleProceed} className="flex-[2] py-4 bg-saffron text-forest rounded-xl font-bold uppercase shadow-lg disabled:opacity-30 transition-all hover:scale-[1.02]">
                        {loading ? 'Processing...' : (rescheduleId ? (lang === 'en' ? 'Confirm Move' : 'पुष्टि करें') : (lang === 'en' ? 'Pay & Book' : 'भुगतान और बुकिंग'))}
                      </button>
                    </div>
                  </div>
                )}

                {step === 3 && (
                  <div className="text-center space-y-6 animate-in zoom-in duration-500">
                    <div className="w-24 h-24 bg-forest/10 rounded-full flex items-center justify-center mx-auto">
                      <CheckCircle2 size={60} className="text-forest" />
                    </div>
                    <h2 className="text-4xl font-serif text-forest">{lang === 'en' ? 'Success!' : 'सफल!'}</h2>
                    <p className="text-forest/60 max-w-sm mx-auto">
                      {lang === 'en' ? 'Consultation confirmed. Link sent to Email & WhatsApp.' : 'परामर्श सुनिश्चित हो गया है। लिंक भेज दिया गया है।'}
                    </p>
                    <button onClick={() => window.location.href = '/'} className="px-8 py-3 border border-forest/20 rounded-full text-forest text-sm font-bold hover:bg-forest hover:text-sand transition-all">
                       {lang === 'en' ? 'Back to Home' : 'मुख्य पृष्ठ पर जाएँ'}
                    </button>
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

export default function ConsultationPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-sand flex items-center justify-center">Loading...</div>}>
      <ConsultationContent />
    </Suspense>
  );
}