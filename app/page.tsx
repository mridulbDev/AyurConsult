"use client"; // Add this at the very top for the FAQ toggles
import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Award, GraduationCap, Leaf, ShieldCheck, Users, Plus, Minus, ChevronRight } from 'lucide-react';

export default function HomePage() {

  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const disorders = [
    { en: "Rasavaha Srotas Disorders", hi: "रसवह स्रोतस विकार", img: "RasavahaSrotasDisorders.png" },
    { en: "Udakavaha & Svedavaha Srotas", hi: "उदकवह व स्वेदवह स्रोतस विकार", img: "Udakavaha&SvedavahaSrotasDisorders.png" },
    { en: "GIT Disorders", hi: "अन्नवह व पुरीषवह स्रोतस विकार", img: "GITDisorders.png" },
    { en: "Liver & Spleen Disorders", hi: "यकृत, प्लीहा विकार", img: "Liver&SpleenDisorders.png" },
    { en: "Respiratory Disorders", hi: "प्राणवह स्रोतस विकार", img: "RespiratoryDisorders.png" },
    { en: "Cardiovascular Disease (CVD)", hi: "हृदय रोग विकार", img: "CardiovascularDisease.png" },
    { en: "Urologic Disorders", hi: "मूत्रवह स्रोतस", img: "UrologicDisorders.png" },
    { en: "Male Reproductive disorders", hi: "पुरुष जनन तंत्र विकार", img: "MaleReproductiveDisorders.png" },
    { en: "Female Reproductive disorders", hi: "स्त्री जनन तंत्र विकार", img: "FemaleReproductivedisorders.png" },
    { en: "Obstetrical disorders", hi: "प्रसूति तंत्र विकार", img: "Obstetricaldisorders.png" },
    { en: "Pediatric disorders", hi: "बाल रोग विकार", img: "PediatricDisorders.png" },
    { en: "Skeletal and joint disorders", hi: "अस्थि संधिगत विकार", img: "Skeletalandjointdisorders.png" },
    { en: "Nervous system disorders", hi: "वात व्याधि / तंत्रिका तंत्र विकार", img: "Nervoussystemdisorders.png" },
    { en: "Psychiatric disorders", hi: "मनोरोग / मानसिक विकार", img: "Psychiatricdisorders.png" },
    { en: "Eye disorders", hi: "नेत्र विकार", img: "Eyedisorders.png" },
    { en: "Ear disorders", hi: "कर्ण विकार", img: "Eardisorders.png" },
    { en: "Nasal disorders", hi: "नासा विकार", img: "Nasaldisorders.png" },
    { en: "Throat disorders", hi: "गल रोग", img: "Throatdisorders.png" },
    { en: "Lip or Oral disorders", hi: "ओष्ठ रोग", img: "LiporOraldisorders.png" },
    { en: "Dental & Periodontal disorders", hi: "दन्त व दन्त मूलगत रोग", img: "Dental&Periodontaldisorders.png" },
    { en: "Urinary system disorders", hi: "मेदोवह स्रोतस", img: "Urinarysystemdisorders.png" },
    { en: "Endocrine disorders", hi: "अंत:स्रावी विकार", img: "Endocrinedisorders.png" },
    { en: "Worm disease", hi: "कृमि रोग", img: "Wormdisease.png" },
    { en: "Communicable disease", hi: "उपसर्गज व्याधियाँ", img: "Communicabledisease.png" },
    { en: "Muscular disorders", hi: "मांसवह स्रोतस विकार", img: "Musculardisorders.png" },
    { en: "Surgical Disorders", hi: "शल्य चिकित्सा विकार", img: "SurgicalDisorders.png" },
    { en: "Beauty problems", hi: "सौन्दर्य समस्याएं", img: "Beautyproblems.png" },
    { en: "Head disorders", hi: "शिरो रोग", img: "Headdisorders.png" },
    { en: "Skin Disorder", hi: "त्वचा रोग", img: "SkinDisorders.png" },
    { en: "Vitamin Deficiency", hi: "विटामिन की कमी", img: "VitaminDeficiency.png" },
    { en: "Addiction & Toxicology", hi: "व्यसन मुक्ति एवं विष निवारण", img: "AddictionTreatment&Toxicology.png" }
  ];
  const faqs = [
    {
      q: "What is Ayurveda?",
      a: "Ayurveda is a 5,000-year-old system of natural healing that has its origins in the Vedic culture of India. It focuses on balancing the body, mind, and spirit through diet, lifestyle, and herbal remedies."
    },
    {
      q: "Vata, Pitta aur Kapha क्या होते हैं?",
      a: "ये तीन दोष (Doshas) हैं जो शरीर की जैविक ऊर्जा को नियंत्रित करते हैं। डॉ. दीक्षित आपकी प्रकृति (Prakriti) के अनुसार भोजन और जीवनशैली का परामर्श देते हैं।"
    },
    {
      q: "क्या आयुर्वेदिक उपचार सुरक्षित है?",
      a: "हाँ, अनुभवी विशेषज्ञों की देखरेख में किया गया आयुर्वेदिक उपचार पूरी तरह सुरक्षित है और इसके कोई दुष्प्रभाव नहीं होते।"
    },
    {
      q: "क्या आयुर्वेद में Chronic Diseases का इलाज संभव है?",
      a: "हाँ, डॉ. दीक्षित मधुमेह, उच्च रक्तचाप, पाचन संबंधी समस्याओं और पुराने दर्द जैसे रोगों का सफल उपचार करते हैं।"
    }
  ];
  return (
    <div className="space-y-24 pb-24">
      {/* HERO SECTION */}
      <section className="max-w-7xl mx-auto px-6 pt-12 grid md:grid-cols-2 gap-12 items-center">
        <div className="space-y-6">
          <div className="badge-vedic">25+ Years of Excellence</div>
          <h1 className="text-5xl md:text-6xl font-serif font-bold text-forest leading-tight">
            Expert Ayurvedic <br/> <span className="text-saffron">Surgical Care</span>
          </h1>
          <p className="text-xl opacity-90">
            Consult with <strong>Prof. Mahesh Dixit</strong>, a renowned surgeon and educator 
            blending classical Shalya Tantra with modern medical precision.
          </p>
          <div className="flex gap-4">
            <Link href="/consultation" className="btn-vedic">Book Appointment</Link>
            <a href="https://wa.me/..." className="border-2 border-forest px-8 py-3 rounded-full font-bold hover:bg-forest hover:text-sand transition-all">WhatsApp</a>
          </div>
        </div>
        <div className="relative h-[500px] rounded-[40px] overflow-hidden shadow-2xl border-4 border-white">
          <Image src="/images/doctor-mahesh.jpg" alt="Prof. Mahesh Dixit" fill className="object-cover" />
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6">
        <div className="doctor-card">
          <div className="grid md:grid-cols-3 gap-12">
            <div className="md:col-span-2 space-y-6">
              <h2 className="text-3xl font-serif font-bold text-forest">Meet Your Doctor — Prof. Mahesh Dixit</h2>
              <p className="leading-relaxed">
                Prof. Mahesh Dixit is a renowned Ayurvedic surgeon, educator, and healthcare leader with over 
                <strong> 23 years of experience</strong> in clinical practice, teaching, research, and administration.
              </p>
              
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="stat-box">
                  <span className="text-2xl font-bold text-saffron">25+</span>
                  <span className="text-xs uppercase text-center">Theses Guided</span>
                </div>
                <div className="stat-box">
                  <span className="text-2xl font-bold text-saffron">50+</span>
                  <span className="text-xs uppercase text-center">Papers & Books</span>
                </div>
                <div className="stat-box">
                  <span className="text-2xl font-bold text-saffron">100k+</span>
                  <span className="text-xs uppercase text-center">Plants Distributed</span>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-8 pt-4">
                <div className="space-y-4">
                  <h4 className="font-bold flex items-center gap-2 text-saffron"><GraduationCap size={20} /> Academic Excellence</h4>
                  <ul className="list-herbal text-sm">
                    <li><strong>Ph.D. in Ayurveda</strong> – Rajasthan Ayurveda University</li>
                    <li><strong>M.D. in Shalya Tantra</strong> – NIA, Jaipur</li>
                    <li><strong>B.A.M.S.</strong> – Mohata College (University Topper)</li>
                  </ul>
                </div>
                <div className="space-y-4">
                  <h4 className="font-bold flex items-center gap-2 text-saffron"><Award size={20} /> Key Milestones</h4>
                  <ul className="list-herbal text-sm">
                    <li>Dhanwantari Award (1999) - Govt. of Rajasthan</li>
                    <li>Best Teacher Award (2021) - Parul University</li>
                    <li>Bhamashah Award (1991) - Academic Excellence</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-sand/50 p-6 rounded-3xl space-y-6 border border-forest/5">
               <h4 className="font-bold text-forest uppercase tracking-widest text-xs">Community Impact</h4>
               <div className="space-y-4 text-sm">
                  <p className="italic">"Led the <strong>Ghar Ghar Amrita Abhiyan</strong>, distributing over 100,000 medicinal plants."</p>
                  <p className="opacity-80">Ran extensive COVID-19 awareness campaigns and organized 20+ international seminars.</p>
               </div>
               <div className="pt-4 border-t border-forest/10">
                  <h4 className="font-bold mb-2 text-xs">Clinical Expertise</h4>
                  <div className="flex flex-wrap gap-2">
                    {['Ksharsutra', 'Agnikarma', 'Jalouka'].map(tag => (
                      <span key={tag} className="bg-forest/5 text-forest px-2 py-1 rounded text-[10px] font-bold uppercase">{tag}</span>
                    ))}
                  </div>
               </div>
            </div>
          </div>
        </div>
      </section>
      

      {/* WHY CHOOSE US SECTION */}
      <section className="bg-forest py-24 text-sand">
        
        <div className="max-w-7xl mx-auto px-6 text-center">
          <h2 className="text-4xl font-serif font-bold mb-16">Why Choose Our Consultation?</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-8 bg-white/5 rounded-3xl border border-white/10">
              <ShieldCheck className="mx-auto mb-4 text-saffron" size={40} />
              <h3 className="text-xl font-bold mb-2">Surgical Expertise</h3>
              <p className="text-sm opacity-80">Specialist in Ayurvedic surgery, Ksharsutra therapy, Agnikarma, and Jalouka (leech) therapy.</p>
            </div>
            <div className="p-8 bg-white/5 rounded-3xl border border-white/10">
              <Leaf className="mx-auto mb-4 text-saffron" size={40} />
              <h3 className="text-xl font-bold mb-2">Natural & Modern</h3>
              <p className="text-sm opacity-80">Combines classical Ayurvedic knowledge with modern diagnostic tools for effective results.</p>
            </div>
            <div className="p-8 bg-white/5 rounded-3xl border border-white/10">
              <Users className="mx-auto mb-4 text-saffron" size={40} />
              <h3 className="text-xl font-bold mb-2">Patient Centered</h3>
              <p className="text-sm opacity-80">Customized Ayurvedic treatments designed specifically for your body type and health goals.</p>
            </div>
          </div>
        </div>
      </section>
      <section className="max-w-7xl mx-auto px-6 py-20">
  <div className="text-center mb-16">
    <h2 className="text-4xl font-serif font-bold text-forest">Specialized Treatments</h2>
    <p className="hindi text-xl text-saffron mt-2">विशिष्ट चिकित्सा सेवाएँ</p>
    <div className="w-24 h-1 bg-saffron/30 mx-auto mt-6 rounded-full"></div>
  </div>

  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
  {disorders.map((item, index) => (
    <div 
      key={index} 
      className="glass-card group transition-all duration-500 cursor-pointer overflow-hidden border-2 border-transparent hover:border-saffron/30"
    >
      <div className="flex flex-col h-full items-center text-center">
        
        {/* ENHANCED CIRCLE - IMAGE NOW FILLS THE SPACE */}
        <div className="relative w-40 h-40 mb-6 bg-white rounded-full shadow-md border-4 border-sand group-hover:shadow-[0_0_30px_rgba(230,126,34,0.3)] transition-all duration-500 flex items-center justify-center overflow-hidden">
          <div className="relative w-full h-full transition-transform duration-700 group-hover:scale-110">
            <Image 
              src={`/images/DiseaseIMGs/${item.img}`}
              alt={item.en} 
              fill 
              className="object-contain p-2" /* Small p-2 prevents the icon from touching the very edge of the border */
            />
          </div>
        </div>
        
        <h3 className="font-bold text-lg text-forest group-hover:text-saffron transition-colors duration-300">
          {item.en}
        </h3>
        <p className="hindi text-sm mt-2 text-leaf opacity-80">
          {item.hi}
        </p>
      </div>
    </div>
  ))}
</div>  

  <div className="mt-16 text-center">
    <Link href="/consultation" className="btn-vedic scale-110">
      Consult for These Ailments
    </Link>
  </div>
</section>

      <section className="max-w-4xl mx-auto px-6 py-20">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-serif font-bold text-forest">Frequently Asked Questions</h2>
          <p className="text-saffron font-medium mt-2">सामान्य प्रश्न और उत्तर</p>
        </div>

        <div className="space-y-4">
          {faqs.map((faq, i) => (
            <div key={i} className="border-b border-forest/10">
              <button 
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full py-6 flex justify-between items-center text-left hover:text-saffron transition-colors"
              >
                <span className="font-bold text-lg">{faq.q}</span>
                {openFaq === i ? <Minus size={20} /> : <Plus size={20} />}
              </button>
              {openFaq === i && (
                <div className="pb-6 text-forest/80 leading-relaxed animate-in fade-in slide-in-from-top-2 duration-300">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* FINAL CALL TO ACTION */}
      <section className="max-w-7xl mx-auto px-6 mb-20">
        <div className="bg-forest rounded-[40px] p-12 text-center text-sand relative overflow-hidden">
          <div className="relative z-10 space-y-6">
            <h2 className="text-3xl md:text-4xl font-serif font-bold italic">"We don't just treat the disease — we understand its root cause."</h2>
            <p className="max-w-2xl mx-auto opacity-80">Start your journey toward authentic, research-based Ayurvedic healing today.</p>
            <Link href="/consultation" className="btn-vedic !bg-saffron hover:!bg-white hover:!text-forest">
              Book Your Consultation Now
            </Link>
          </div>
          <div className="absolute top-0 right-0 opacity-10 translate-x-1/4 -translate-y-1/4">
            <Leaf size={300} />
          </div>
        </div>
      </section>


    </div>
  );
  
}