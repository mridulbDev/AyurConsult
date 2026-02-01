"use client";
import { 
  RefreshCcw, 
  CalendarClock, 
  UserX, 
  CheckCircle2, 
  Timer, 
  Mail,
  AlertCircle
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

export default function RefundPolicy() {
  const { lang } = useLanguage();

  return (
    <div className="min-h-screen bg-sand/30 py-20 px-6">
      <div className="max-w-4xl mx-auto">
        {/* Saffron side-border to match the new style */}
        <div className="relative bg-white/40 backdrop-blur-md border-l-8 border-saffron rounded-r-[48px] p-8 md:p-16 shadow-xl">
          <div className="flex items-center gap-4 mb-8">
            <RefreshCcw className="text-saffron" size={40} />
            <h1 className="text-4xl font-serif font-bold text-forest">Refund & Cancellation Policy</h1>
          </div>

          <div className="space-y-10 text-forest/80 leading-relaxed">
            <p>
              At <strong>DrDixitAyurved.com</strong>, we strive to provide the best Ayurvedic care and online services. Please read our refund and cancellation policy carefully before making any bookings or payments.
            </p>

            {/* 1. Appointment Cancellation */}
            <section className="space-y-4">
              <h2 className="text-xl font-bold text-forest flex items-center gap-3">
                <div className="p-2 bg-saffron/10 rounded-lg text-saffron"><CalendarClock size={22}/></div>
                1. Appointment Cancellation
              </h2>
              <p>Appointments can be canceled or rescheduled by informing us at least <strong>24 hours</strong> in advance. For cancellations made within the allowed time, we will reschedule the session; however, please note that refunds are not applicable.</p>
              <ul className="list-disc pl-12 space-y-2">
                <li>Meetings can be rescheduled with prior notice.</li>
                <li>No refund or rescheduling for cancellations made <strong>less than 24 hours</strong> before the appointment.</li>
              </ul>
            </section>

            {/* 2. No Show Policy */}
            <section className="space-y-4">
              <h2 className="text-xl font-bold text-forest flex items-center gap-3">
                <div className="p-2 bg-saffron/10 rounded-lg text-saffron"><UserX size={22}/></div>
                2. No Show Policy
              </h2>
              <p>If the patient does not attend the scheduled consultation (online or offline) without prior notice, the session will be marked as completed, and <strong>no refund or rescheduling</strong> will be provided.</p>
            </section>

            {/* 3. Refund Eligibility */}
            <section className="space-y-4">
              <h2 className="text-xl font-bold text-forest flex items-center gap-3">
                <div className="p-2 bg-saffron/10 rounded-lg text-saffron"><CheckCircle2 size={22}/></div>
                3. Refund Eligibility
              </h2>
              <p>Refunds are strictly limited and are only considered in the following rare circumstances:</p>
              <ul className="list-disc pl-12 space-y-2">
                <li>Technical issues from our side preventing the delivery of service.</li>
                <li>Unavailability of the consultant without prior rescheduling.</li>
                <li>Once a consultation or service is completed, <strong>no refund</strong> will be issued under any circumstances.</li>
              </ul>
            </section>

            {/* 4. Processing Time */}
            <section className="space-y-4">
              <h2 className="text-xl font-bold text-forest flex items-center gap-3">
                <div className="p-2 bg-saffron/10 rounded-lg text-saffron"><Timer size={22}/></div>
                4. Processing Time
              </h2>
              <p>In cases where a refund is approved by the management, it will be processed within <strong>5–7 business days</strong> to the original payment method used during booking.</p>
            </section>

            <div className="pt-8 border-t border-forest/10">
              <div className="flex items-start gap-3 p-4 bg-saffron/5 rounded-2xl border border-saffron/10 mb-6">
                <AlertCircle className="text-saffron shrink-0" size={20} />
                <p className="text-sm">Please ensure you have a stable internet connection for online consultations to avoid service disruptions.</p>
              </div>
              
              <p className="font-bold text-forest">Contact Us</p>
              <div className="flex items-center gap-3 mt-2">
                <Mail className="text-saffron" size={20} />
                <span>Email: <strong>drdixitayurveda@gmail.com</strong></span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}