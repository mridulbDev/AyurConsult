"use client";
import { useState } from 'react';
import Image from 'next/image';
import { useLanguage } from './context/LanguageContext';
import Link from 'next/link';
import { Award, GraduationCap, Leaf, ShieldCheck, Users, Plus, Globe, CheckCircle2, BookOpen, Stethoscope } from 'lucide-react';

export default function HomePage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const { lang } = useLanguage();

  const faqs = [
    {
      q: lang === 'en' ? "What is Ayurveda?" : "आयुर्वेद क्या है?",
      a: lang === 'en' ? "Ayurveda is a 5,000-year-old system of natural healing that has its origins in the Vedic culture of India. It focuses on balancing the body, mind, and spirit through diet, lifestyle, and herbal remedies." : "आयुर्वेद प्राकृतिक चिकित्सा की एक 5,000 साल पुरानी प्रणाली है जिसकी उत्पत्ति भारत की वैदिक संस्कृति में हुई है। यह आहार, जीवनशैली और हर्बल उपचार के माध्यम से शरीर, मन और आत्मा को संतुलित करने पर केंद्रित है।"
    },
    {
      q: lang === 'en' ? "What are Vata, Pitta and Kapha?" : "वात, पित्त और कफ क्या होते हैं?",
      a: lang === 'en' ? "These are three doshas that govern biological energy. Dr. Dixit provides diet and lifestyle advice according to your Prakriti." : "ये तीन दोष (Doshas) हैं जो शरीर की जैविक ऊर्जा को नियंत्रित करते हैं। डॉ. दीक्षित आपकी प्रकृति (Prakriti) के अनुसार भोजन और जीवनशैली का परामर्श देते हैं।"
    },
    {
      q: lang === 'en' ? "Is Ayurvedic treatment safe?" : "क्या आयुर्वेदिक उपचार सुरक्षित है?",
      a: lang === 'en' ? "Yes, Ayurvedic treatment performed under the supervision of experienced specialists is completely safe and has no side effects." : "हाँ, अनुभवी विशेषज्ञों की देखरेख में किया गया आयुर्वेदिक उपचार पूरी तरह सुरक्षित है और इसके कोई दुष्प्रभाव नहीं होते।"
    },
    {
      q: lang === 'en' ? "Is it possible to treat chronic diseases in Ayurveda?" : "क्या आयुर्वेद में गंभीर रोगों (Chronic Diseases) का इलाज संभव है?",
      a: lang === 'en' ? "Yes, Dr. Dixit successfully treats diseases such as diabetes, hypertension, digestive problems, and chronic pain." : "हाँ, डॉ. दीक्षित मधुमेह, उच्च रक्तचाप, पाचन संबंधी समस्याओं और पुराने दर्द जैसे रोगों का सफल उपचार करते हैं। "
    }
  ];

  const t = {
    heroBadge: lang === 'en' ? "25+ Years of Excellence" : "25+ वर्षों का उत्कृष्ट अनुभव",
    heroTitle: lang === 'en' ? "Expert Ayurvedic" : "विशेषज्ञ आयुर्वेदिक",
    heroTitleSpan: lang === 'en' ? "Surgical Care" : "शल्य चिकित्सा",
    heroDesc: lang === 'en' ? "Consult with Prof. Mahesh Dixit, a renowned surgeon and educator blending classical Shalya Tantra with modern medical precision." : "प्रो. महेश दीक्षित से परामर्श लें, जो एक प्रसिद्ध सर्जन और शिक्षक हैं, जो शास्त्रीय शल्य तंत्र को आधुनिक चिकित्सा सटीकता के साथ जोड़ते हैं।",
    heroCta: lang === 'en' ? "Book Appointment" : "अपॉइंटमेंट बुक करें",
    blogs: lang === 'en' ? "Read Blogs" : "ब्लॉग पढ़ें",
    meetDr: lang === 'en' ? "Meet Your Doctor — Prof. Mahesh Dixit" : "अपने डॉक्टर से मिलें — प्रो. महेश दीक्षित",
    drBio: lang === 'en' ? "Prof. Mahesh Dixit is a renowned Ayurvedic surgeon, educator, and healthcare leader with over 25 years of experience in clinical practice, teaching, research, and administration." : "प्रो. महेश दीक्षित एक प्रसिद्ध आयुर्वेदिक सर्जन, शिक्षक और स्वास्थ्य सेवा क्षेत्र के मार्गदर्शक हैं, जिन्हें नैदानिक अभ्यास, शिक्षण, अनुसंधान और प्रशासन में 25 से अधिक वर्षों का अनुभव प्राप्त है।",
    stat1: lang === 'en' ? "Theses Guided" : "निर्देशित शोध",
    stat2: lang === 'en' ? "Global Seminars" : "वैश्विक सेमिनार",
    stat3: lang === 'en' ? "Plants Distributed" : "पौधे वितरित किए",
    acadTitle: lang === 'en' ? "Academic Excellence" : "शैक्षणिक उत्कृष्टता",
    acad1: lang === 'en' ? "Ph.D. in Ayurveda – Rajasthan Ayurveda University" : "आयुर्वेद में पीएचडी (Ph.D.) – राजस्थान आयुर्वेद विश्वविद्यालय",
    acad2: lang === 'en' ? "M.D. in Shalya Tantra – NIA, Jaipur" : "शल्य तंत्र में एमडी (M.D.) – एनआईए (NIA), जयपुर",
    acad3: lang === 'en' ? "B.A.M.S. – Mohata College " : "बीएएमएस (B.A.M.S.) – मोहता कॉलेज ",
    awardTitle: lang === 'en' ? "Key Milestones" : "प्रमुख उपलब्धियां",
    award1: lang === 'en' ? "Dhanwantari Award (1999) - Govt. of Rajasthan" : "धन्वंतरि पुरस्कार (1999) - राजस्थान सरकार",
    award2: lang === 'en' ? "Best Teacher Award (2021) - Parul University" : "सर्वश्रेष्ठ शिक्षक पुरस्कार (2021) - पारुल यूनिवर्सिटी",
    award3: lang === 'en' ? "Bhamashah Award (1991) - Academic Excellence" : "भामाशाह पुरस्कार (1991) - शैक्षणिक उत्कृष्टता",
    impactTitle: lang === 'en' ? "Community Impact" : "सामुदायिक प्रभाव",
    specTitle: lang === 'en' ? "Specialized Treatments" : "विशिष्ट उपचार",
    impactPoint1: lang === 'en' ? "Led 'Ghar Ghar Amrita Abhiyan', distributing 100,000+ medicinal plants." : "'घर-घर अमृता अभियान' का नेतृत्व, 1,00,000+ औषधीय पौधों का वितरण।",
    impactPoint2: lang === 'en' ? "Ran extensive COVID-19 awareness campaigns (2020-2021)." : "व्यापक कोविड-19 जागरूकता अभियान (2020-2021) का सफल संचालन।",
    impactPoint3: lang === 'en' ? "Organized 20+ international seminars & 75+ public lectures." : "20+ अंतरराष्ट्रीय सेमिनारों और 75+ सार्वजनिक व्याख्यानों का आयोजन।",
    whyTitle: lang === 'en' ? "Why Choose Our Consultation?" : "हमारा परामर्श क्यों चुनें?",
    ctaQuote: lang === 'en' ? "\"We don't just treat the disease — we understand its root cause.\"" : "\"हम केवल बीमारी का इलाज नहीं करते — हम उसके मूल कारण को समझते हैं।\"",
    ctaDesc: lang === 'en' ? "Start your journey toward authentic, research-based Ayurvedic healing today." : "आज ही प्रामाणिक और शोध-आधारित आयुर्वेदिक चिकित्सा की दिशा में अपनी यात्रा शुरू करें।",
    ctaBtn: lang === 'en' ? "Book Your Appointment Now" : "अभी अपना परामर्श बुक करें",
    faqTitle: lang === 'en' ? "Frequently Asked Questions" : "अक्सर पूछे जाने वाले प्रश्न"
  };

  const whyCards = [
    { 
      icon: ShieldCheck, 
      title: lang === 'en' ? "Surgical Expertise" : "शल्य चिकित्सा विशेषज्ञता", 
      desc: lang === 'en' ? "Specialist in Ayurvedic surgery, Ksharsutra therapy, and Agnikarma." : "आयुर्वेदिक सर्जरी, क्षारसूत्र चिकित्सा और अग्निकर्म के विशेषज्ञ।" 
    },
    { 
      icon: Award, 
      title: lang === 'en' ? "Nationally Awarded" : "राष्ट्रीय स्तर पर सम्मानित", 
      desc: lang === 'en' ? "Recognized by the Govt. of Rajasthan for clinical and academic excellence." : "नैदानिक और शैक्षणिक उत्कृष्टता के लिए राजस्थान सरकार द्वारा मान्यता प्राप्त।" 
    },
    { 
      icon: Globe, 
      title: lang === 'en' ? "Classical & Modern" : "शास्त्रीय और आधुनिक", 
      desc: lang === 'en' ? "Combines classical Shalya Tantra with modern medical precision." : "शास्त्रीय शल्य तंत्र को आधुनिक चिकित्सा सटीकता के साथ जोड़ता है।" 
    },
    { 
      icon: Users, 
      title: lang === 'en' ? "Patient Centered" : "रोगी केंद्रित दृष्टिकोण", 
      desc: lang === 'en' ? "Customized treatments designed specifically for your body type (Prakriti)." : "विशेष रूप से आपके शरीर के प्रकार (प्रकृति) के लिए डिज़ाइन किए गए व्यक्तिगत उपचार।" 
    }
  ];

  return (
    <div className="space-y-16 pb-24 relative overflow-hidden">
      {/* Hero Section - Image Left, Content Right */}
      <section className="max-w-7xl mx-auto px-6 pt-12 grid md:grid-cols-2 gap-12 items-center">
        {/* Image now comes first in DOM for mobile/tablet, will be left on md+ screens */}
        <div className="relative h-[500px] rounded-[40px] overflow-hidden shadow-2xl border-4 border-white animate-float order-2 md:order-1">
          <Image src="/images/drdixit.png" alt="Prof. Mahesh Dixit" fill className="object-cover" priority />
        </div>

        {/* Text Content comes second in DOM, will be right on md+ screens */}
        <div className="space-y-6 animate-fade-up order-1 md:order-2">
          <div className="badge-vedic">{t.heroBadge}</div>
          <h1 className="text-5xl md:text-6xl font-serif font-bold text-forest leading-tight">
            {t.heroTitle} <br/> <span className="text-saffron">{t.heroTitleSpan}</span>
          </h1>
          <p className="text-xl opacity-90">{t.heroDesc}</p>
          <div className="flex gap-4">
            <Link href="/consultation" className="btn-vedic">{t.heroCta}</Link>
            <Link href="/blogs" className="border-2 border-forest px-8 py-3 rounded-full font-bold hover:bg-forest hover:text-sand transition-all flex items-center gap-2">
               <BookOpen size={18} /> {t.blogs}
            </Link>
          </div>
        </div>
      </section>

      {/* DOCTOR BIO & COMMUNITY IMPACT SECTION */}
      <section className="max-w-7xl mx-auto px-6">
        <div className="relative bg-white/40 backdrop-blur-md border-l-8 border-saffron rounded-r-[48px] p-8 md:p-12 shadow-xl animate-fade-up">
          <div className="grid md:grid-cols-3 gap-12">
            <div className="md:col-span-2 space-y-6">
              <h2 className="text-3xl font-serif font-bold text-forest tracking-tight">{t.meetDr}</h2>
              <p className="leading-relaxed text-forest/90">{t.drBio}</p>
              
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="stat-box-sand">
                  <span className="text-2xl font-bold text-saffron">25+</span>
                  <span className="text-xs uppercase text-center font-bold text-forest">{t.stat1}</span>
                </div>
                <div className="stat-box-sand">
                  <span className="text-2xl font-bold text-saffron">95+</span>
                  <span className="text-xs uppercase text-center font-bold text-forest">{t.stat2}</span>
                </div>
                <div className="stat-box-sand">
                  <span className="text-2xl font-bold text-saffron">100k+</span>
                  <span className="text-xs uppercase text-center font-bold text-forest">{t.stat3}</span>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-8 pt-4">
                <div className="space-y-4">
                  <h4 className="font-bold flex items-center gap-2 text-saffron uppercase tracking-wider text-sm"><GraduationCap size={20} /> {t.acadTitle}</h4>
                  <ul className="list-herbal text-sm text-forest/80">
                    <li>{t.acad1}</li>
                    <li>{t.acad2}</li>
                    <li>{t.acad3}</li>
                  </ul>
                </div>
                <div className="space-y-4">
                  <h4 className="font-bold flex items-center gap-2 text-saffron uppercase tracking-wider text-sm"><Award size={20} /> {t.awardTitle}</h4>
                  <ul className="list-herbal text-sm text-forest/80">
                    <li>{t.award1}</li>
                    <li>{t.award2}</li>
                    <li>{t.award3}</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* COMMUNITY IMPACT & SPECIALIZED TREATMENTS BOX */}
<div className="bg-forest p-8 rounded-3xl space-y-8 border border-white/10 flex flex-col justify-between shadow-xl text-sand">
   <div>
      <h4 className="font-bold text-saffron uppercase tracking-widest text-[10px] mb-5 flex items-center gap-2">
        <Globe size={14} /> {t.impactTitle}
      </h4>
      <ul className="space-y-4">
        {[t.impactPoint1, t.impactPoint2, t.impactPoint3].map((point, idx) => (
          <li key={idx} className="flex gap-3 text-sm leading-snug">
            <CheckCircle2 className="text-saffron flex-shrink-0" size={18} />
            <span className="opacity-90">{point}</span>
          </li>
        ))}
      </ul>
   </div>

   <div className="pt-6 border-t border-white/10">
      <h4 className="font-bold text-saffron uppercase tracking-widest text-[10px] mb-4 flex items-center gap-2">
        <Stethoscope size={14} /> {t.specTitle}
      </h4>
      <div className="flex flex-wrap gap-2">
        {(lang === 'en' 
          ? ['Ksharsutra', 'Agnikarma', 'Jalouka'] 
          : ['क्षारसूत्र', 'अग्निकर्म', 'जलौका']
        ).map(tag => (
          <span key={tag} className="bg-white/10 text-sand px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase border border-white/5 transition-colors hover:bg-saffron hover:text-forest">
            {tag}
          </span>
        ))}
      </div>
   </div>
</div>
          </div>
        </div>
      </section>

      {/* WHY CHOOSE US SECTION */}
      <section className="bg-forest py-20 text-sand relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-white/5 to-transparent"></div>
        <Leaf className="absolute -top-24 -right-24 opacity-5 rotate-45 text-sand" size={500} />
        
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="max-w-3xl mx-auto text-center mb-12 animate-fade-up">
            <h2 className="text-4xl md:text-5xl font-serif font-bold tracking-tight mb-4 text-saffron">{t.whyTitle}</h2>
            <p className="opacity-60 text-base italic">
              {lang === 'en' 
                ? "Bridging ancient wisdom with modern clinical precision" 
                : "प्राचीन ज्ञान और आधुनिक नैदानिक सटीकता का संगम"}
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
            {whyCards.map((item, i) => (
              <div 
                key={i} 
                className="group p-8 rounded-[32px] bg-white/5 border border-white/10 transition-all duration-500 hover:bg-white/[0.08] hover:border-saffron/40 hover:-translate-y-3 hover:shadow-[0_20px_40px_rgba(0,0,0,0.3)]"
              >
                <div className="w-12 h-12 rounded-xl bg-saffron/10 flex items-center justify-center mb-6 group-hover:bg-saffron group-hover:text-forest transition-all duration-500">
                  <item.icon size={28} className="transition-colors duration-500" />
                </div>
                <h3 className="text-lg font-bold mb-3 text-sand group-hover:text-saffron transition-colors">{item.title}</h3>
                <p className="text-sm leading-relaxed opacity-50 group-hover:opacity-100 transition-opacity duration-500">{item.desc}</p>
              </div>
            ))}
          </div>

          <div className="max-w-3xl mx-auto animate-fade-up">
            <div className="relative p-[1px] rounded-[32px] bg-gradient-to-r from-transparent via-saffron/40 to-transparent">
              <div className="bg-forest-dark border border-white/10 rounded-[32px] px-8 py-10 text-center shadow-2xl relative overflow-hidden">
                <div className="relative z-10 space-y-6">
                  <h3 className="text-xl md:text-3xl font-serif font-medium leading-tight max-w-xl mx-auto">{t.ctaQuote}</h3>
                  <p className="text-sand/50 max-w-md mx-auto text-xs md:text-sm uppercase tracking-wide">{t.ctaDesc}</p>
                  <Link href="/consultation" className="inline-flex items-center gap-3 bg-saffron hover:bg-white text-forest px-8 py-3 rounded-full font-bold text-base transition-all hover:scale-105">{t.ctaBtn}</Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ SECTION */}
      <section className="max-w-5xl mx-auto px-6 py-10">
        <div className="relative bg-white/40 backdrop-blur-md border-l-8 border-saffron rounded-r-[48px] p-8 md:p-12 shadow-xl">
          <div className="text-center mb-10">
            <h2 className="text-4xl font-serif font-bold text-forest">{t.faqTitle}</h2>
            <div className="flex justify-center gap-2 mt-4">
              {[1, 2, 3].map((i) => (
                <span key={i} className="h-1 w-1 bg-saffron rounded-full"></span>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            {faqs.map((faq, i) => (
              <div key={i} className={`rounded-2xl transition-all duration-300 ${openFaq === i ? 'bg-white/80 shadow-sm' : 'hover:bg-white/30'}`}>
                <button 
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full px-6 py-5 flex justify-between items-center text-left"
                >
                  <span className={`font-bold text-lg transition-colors ${openFaq === i ? 'text-saffron' : 'text-forest'}`}>
                    {faq.q}
                  </span>
                  <div className={`transition-transform duration-300 ${openFaq === i ? 'rotate-180' : ''}`}>
                    <Plus size={20} className={openFaq === i ? 'text-saffron' : 'text-forest/40'} />
                  </div>
                </button>
                <div className={`overflow-hidden transition-all duration-500 ease-in-out ${openFaq === i ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
                  <p className="px-6 pb-6 text-forest/70 leading-relaxed text-base border-t border-forest/5 pt-3 mx-4">
                    {faq.a}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}