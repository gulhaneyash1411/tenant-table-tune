import { createFileRoute, Link } from "@tanstack/react-router";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ComponentType, type FormEvent, type ReactNode } from "react";
import { motion, AnimatePresence, useReducedMotion, type TargetAndTransition } from "framer-motion";
import {
  Utensils, Zap, ArrowRight, PlayCircle, Check, CheckCircle2, ChevronLeft, ChevronRight,
  ShoppingCart, QrCode, CalendarDays, LineChart, FileText, Percent,
  Mail, Phone, MapPin, Send, Bell, LayoutDashboard, ChefHat, BarChart3, Loader2, X, Globe, ChevronDown, Menu,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  EMPTY_SITE_SETTINGS, loadSiteSettings, parseTrialDays, safeUrl, whatsappHref, whatsappNumber, type SiteSettings,
} from "@/lib/site-settings";
// import platesos_teaser from "public/videos/platesos_teaser.mp4"

export const Route = createFileRoute("/")({ loader: () => loadSiteSettings(), component: PlatesOS });

// ====================
// PLATESOS CONFIG
// ====================
const BRAND = { name: "PlatesOS", primary: "#0B7BFF", dark: "#0B1B3F", soft: "#EAF3FF" };

const contactHours = "Mon – Fri, 9:00 AM – 6:00 PM";

// Default text for the floating WhatsApp chat
const whatsappChatMessage = "Hi PlatesOS! \nI'd like to know more about your restaurant management platform.";

type Site = SiteSettings & {
  /** WhatsApp chat link carrying `msg`, or null when WhatsApp isn't configured. */
  waLink: (msg: string) => string | null;
  /** Free-trial length in days (settings value, or the default). */
  trialDayCount: number;
};

const buildSite = (s: SiteSettings): Site => {
  const n = whatsappNumber(s.whatsapp);
  const fallback = whatsappHref(s.whatsapp); // e.g. a group invite link — can't carry text
  return {
    ...s,
    waLink: (msg) => (n ? `https://wa.me/${n}?text=${encodeURIComponent(msg)}` : fallback),
    trialDayCount: parseTrialDays(s.trialDays),
  };
};

const SiteCtx = createContext<Site>(buildSite(EMPTY_SITE_SETTINGS));
const useSite = () => useContext(SiteCtx);

// Copy can carry {email} / {phone} / {location} / {days} placeholders so it
// always quotes the saved settings. Placeholders go in the English source and
// the translations alike, and are filled after translating. FAQ answers whose
// contact placeholder has no value are hidden ({days} always has one).
const CONTACT_TOKENS = { email: "{email}", phone: "{phone}", location: "{location}" } as const;
const faqMissing = (text: string, site: Site) =>
  (Object.keys(CONTACT_TOKENS) as (keyof typeof CONTACT_TOKENS)[]).some((k) => text.includes(CONTACT_TOKENS[k]) && !site[k]);
const fillTokens = (text: string, site: Site) =>
  text
    .replaceAll(CONTACT_TOKENS.email, site.email)
    .replaceAll(CONTACT_TOKENS.phone, site.phone)
    .replaceAll(CONTACT_TOKENS.location, site.location)
    .replaceAll("{days}", String(site.trialDayCount));

type AgentStyle = "card" | "chat" | "peek" | "pill" | "guided";
const AGENT_STYLE: AgentStyle = "guided";

// Quick replies (used by the "chat" style)
const agentQuickReplies = [
  { label: "💰 Pricing", message: "Hi PlatesOS! Can you share your pricing plans?" },
  { label: "📅 Book a demo", message: "Hi PlatesOS! I'd like to book a demo." },
  { label: "📱 QR ordering", message: "Hi PlatesOS! Tell me more about QR table ordering." },
];

// Demo video: a YouTube link or a file path (e.g. "/videos/platesos-demo.mp4" in /public)
const DEMO_VIDEO_URL = "/videos/platesos_teaser.mp4";

const NAV = [
  { id: "home", label: "Home" },
  { id: "features", label: "Features" },
  { id: "products", label: "Products" },
  { id: "about", label: "About" },
  { id: "pricing", label: "Pricing" },
  { id: "contact", label: "Contact" },
];

const scrollTo = (id: string) =>
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

// ====================
// LANGUAGE / i18n
// ====================
type Lang = "en" | "hi" | "mr" | "kn";
const LANGS: { id: Lang; label: string; short: string }[] = [
  { id: "en", label: "English", short: "EN" },
  { id: "hi", label: "हिंदी", short: "हि" },
  { id: "mr", label: "मराठी", short: "मर" },
  { id: "kn", label: "ಕನ್ನಡ", short: "ಕನ" },
];

// Keyed by the English string. Anything missing falls back to English.
const TRANSLATIONS: Record<Exclude<Lang, "en">, Record<string, string>> = {
  hi: {
    // nav
    "Home": "होम", "Features": "फीचर्स", "Products": "प्रोडक्ट्स", "Pricing": "प्राइसिंग",
    "About": "हमारे बारे में", "Contact": "संपर्क", "Sign in": "साइन इन", "Get started": "शुरू करें",
    // hero
    "Modern Restaurant Management Platform": "आधुनिक रेस्टोरेंट मैनेजमेंट प्लेटफ़ॉर्म",
    "Run Your Restaurant.": "अपना रेस्टोरेंट चलाइए.", "Smarter.": "स्मार्ट तरीके से.",
    "One powerful platform to manage orders, tables, bookings, QR ordering, and daily operations — all in one place.":
      "ऑर्डर, टेबल, बुकिंग, QR ऑर्डरिंग और रोज़ के कामकाज — सब कुछ एक ही मज़बूत प्लेटफ़ॉर्म पर।",
    "Start free trial": "फ्री ट्रायल शुरू करें", "Watch video": "वीडियो देखें",
    "No commission": "कोई कमीशन नहीं", "{days}-day free trial": "{days} दिन का फ्री ट्रायल", "Easy setup": "आसान सेटअप",
    // carousel
    "Dashboard": "डैशबोर्ड", "QR Table Ordering": "QR टेबल ऑर्डरिंग", "Online Ordering": "ऑनलाइन ऑर्डरिंग",
    "Kitchen Operations": "किचन ऑपरेशन्स", "Analytics": "एनालिटिक्स",
    // features
    "Everything you need": "आपकी हर ज़रूरत",
    "Powerful features for": "आपके रेस्टोरेंट के लिए", "your restaurant": "दमदार फीचर्स",
    "From online orders to detailed reports, PlatesOS gives you the tools to run your restaurant smoothly and efficiently.":
      "ऑनलाइन ऑर्डर से लेकर विस्तृत रिपोर्ट तक, PlatesOS आपको रेस्टोरेंट आसानी से चलाने के सभी टूल देता है।",
    "Let customers order from anywhere.": "ग्राहक कहीं से भी ऑर्डर कर सकें।",
    "Delivery & takeaway": "डिलीवरी और टेकअवे",
    "Unique QR codes for every table.": "हर टेबल के लिए अलग QR कोड।", "Scan · Order · Pay": "स्कैन · ऑर्डर · पेमेंट",
    "Table & Booking Management": "टेबल और बुकिंग मैनेजमेंट",
    "Manage reservations and table allocation.": "रिज़र्वेशन और टेबल अलॉटमेंट संभालें।", "Live floor plan": "लाइव फ़्लोर प्लान",
    "Restaurant Dashboard": "रेस्टोरेंट डैशबोर्ड",
    "Track orders, sales, and performance in real-time.": "ऑर्डर, बिक्री और परफ़ॉर्मेंस रियल-टाइम में देखें।", "Real-time": "रियल-टाइम",
    "Orders, Reports & Invoices": "ऑर्डर, रिपोर्ट और इनवॉइस",
    "Stay organized with detailed reports.": "विस्तृत रिपोर्ट के साथ सब व्यवस्थित रखें।", "GST-ready invoices": "GST-रेडी इनवॉइस",
    "No Commission": "कोई कमीशन नहीं", "Keep 100% of your earnings.": "अपनी पूरी कमाई अपने पास रखें।", "0% per order": "हर ऑर्डर पर 0%",
    // products
    "On every table": "हर टेबल पर",
    "Premium QR products for": "आपकी टेबल के लिए", "your tables": "प्रीमियम QR प्रोडक्ट्स",
    "Printed once, branded to your restaurant, and built to survive daily service. Every product links straight to your PlatesOS menu.":
      "एक बार प्रिंट, आपके रेस्टोरेंट की ब्रांडिंग और रोज़ के इस्तेमाल लायक मज़बूती। हर प्रोडक्ट सीधे आपके PlatesOS मेन्यू से जुड़ता है।",
    "Condiment Holder QR": "कंडिमेंट होल्डर QR", "Best seller": "सबसे लोकप्रिय",
    "One caddy for spoons, forks, salt, pepper and napkins — with your ordering QR printed on the front face.":
      "चम्मच, कांटे, नमक, काली मिर्च और नैपकिन के लिए एक ही स्टैंड — सामने की तरफ़ आपका ऑर्डरिंग QR प्रिंटेड।",
    "L-Shaped Table Tent QR": "L-शेप टेबल टेंट QR", "Table numbering": "टेबल नंबरिंग",
    "Slim L-stand printed with your table number on both faces, so guests and servers always know the table.":
      "पतला L-स्टैंड, दोनों तरफ़ टेबल नंबर प्रिंटेड — ग्राहक और स्टाफ़ दोनों को टेबल तुरंत पता चले।",
    "Tissue Box QR Branding": "टिशू बॉक्स QR ब्रांडिंग", "Everyday branding": "रोज़ाना ब्रांडिंग",
    "Custom-printed tissue boxes carrying your logo and ordering QR — useful on the table, seen at every meal.":
      "आपके लोगो और ऑर्डरिंग QR के साथ कस्टम-प्रिंटेड टिशू बॉक्स — टेबल पर उपयोगी, हर बार नज़र में।",
    "Get This for My Restaurant": "मेरे रेस्टोरेंट के लिए चाहिए",
    "Front": "सामने", "Back": "पीछे", "Left": "बाएँ", "Right": "दाएँ",
    "Product images are indicative mockups — hover or tap the arrows to see all four sides. Custom sizes, colours and branding available on request.":
      "प्रोडक्ट इमेज सांकेतिक मॉकअप हैं — चारों तरफ़ देखने के लिए ऐरो पर टैप करें। कस्टम साइज़, रंग और ब्रांडिंग अनुरोध पर उपलब्ध।",
    // why
    "Why choose PlatesOS": "PlatesOS ही क्यों",
    "Built for modern": "आधुनिक रेस्टोरेंट", "restaurants": "के लिए बना",
    "Simple to use, powerful behind the scenes, and designed to help you serve better, manage easier, and grow faster.":
      "इस्तेमाल में आसान, अंदर से दमदार — बेहतर सर्विस, आसान मैनेजमेंट और तेज़ ग्रोथ के लिए।",
    "Easy setup & onboarding": "आसान सेटअप और ऑनबोर्डिंग", "Dedicated support": "समर्पित सपोर्ट",
    "Scalable for single or multi-branch restaurants": "एक या कई ब्रांच वाले रेस्टोरेंट के लिए उपयुक्त",
    "Trusted by modern food businesses": "आधुनिक फ़ूड बिज़नेस का भरोसा",
    "New Order": "नया ऑर्डर", "New Booking": "नई बुकिंग", "Daily Report Ready": "दैनिक रिपोर्ट तैयार",
    // pricing
    "Simple pricing": "सरल प्राइसिंग", "Plans that grow": "आपके साथ बढ़ने", "with you": "वाले प्लान",
    "No commission on orders. {days}-day free trial on every plan.": "ऑर्डर पर कोई कमीशन नहीं। हर प्लान पर {days} दिन का फ्री ट्रायल।",
    "Starter": "स्टार्टर", "For single-outlet cafés": "सिंगल-आउटलेट कैफ़े के लिए",
    "QR table ordering": "QR टेबल ऑर्डरिंग", "Online menu": "ऑनलाइन मेन्यू", "Basic reports": "बेसिक रिपोर्ट", "Email support": "ईमेल सपोर्ट",
    "Growth": "ग्रोथ", "For busy restaurants": "व्यस्त रेस्टोरेंट के लिए", "Everything in Starter": "स्टार्टर का सब कुछ",
    "Online ordering website": "ऑनलाइन ऑर्डरिंग वेबसाइट", "Kitchen display": "किचन डिस्प्ले",
    "Enterprise": "एंटरप्राइज़", "For chains & multi-branch": "चेन और कई ब्रांच के लिए", "Everything in Growth": "ग्रोथ का सब कुछ",
    "Multi-branch control": "मल्टी-ब्रांच कंट्रोल", "Advanced analytics": "एडवांस्ड एनालिटिक्स", "Dedicated manager": "समर्पित मैनेजर",
    "Most popular": "सबसे लोकप्रिय", "/month": "/माह", "Talk to sales": "सेल्स से बात करें", "Custom": "कस्टम",
    // contact
    "Get in touch": "संपर्क करें", "Us": "करें",
    "We'd love to hear from you! Whether you have a question, need support, or want to partner with us — we're here to help.":
      "हमें आपसे सुनना अच्छा लगेगा! सवाल हो, सपोर्ट चाहिए हो या पार्टनरशिप — हम मदद के लिए मौजूद हैं।",
    "Email": "ईमेल", "We'll respond within 24 hours.": "हम 24 घंटे में जवाब देंगे।",
    "Phone": "फ़ोन", "Mon – Fri, 9:00 AM – 6:00 PM": "सोम – शुक्र, सुबह 9:00 – शाम 6:00",
    "Location": "पता", "(Remote support available)": "(रिमोट सपोर्ट उपलब्ध)",
    "Send us a message": "हमें संदेश भेजें", "Full name": "पूरा नाम", "Your name": "आपका नाम",
    "Restaurant name": "रेस्टोरेंट का नाम", "Subject": "विषय", "Select an option": "एक विकल्प चुनें",
    "Book a demo": "डेमो बुक करें", "Support": "सपोर्ट", "Partnership": "पार्टनरशिप",
    "Message": "संदेश", "How can we help you?": "हम आपकी कैसे मदद करें?",
    "Send message": "संदेश भेजें", "Sending…": "भेजा जा रहा है…",
    "Name is required": "नाम ज़रूरी है", "Enter a valid email": "सही ईमेल डालें", "Enter a valid phone": "सही फ़ोन नंबर डालें",
    "Choose a subject": "विषय चुनें", "Message must be at least 10 characters": "संदेश कम से कम 10 अक्षरों का हो",
    "Message must be under 5000 characters": "संदेश 5000 अक्षरों से कम का हो",
    "Couldn't send your message. Please try again.": "आपका संदेश नहीं भेजा जा सका। कृपया फिर से कोशिश करें।",
    "Or email us at": "या हमें ईमेल करें:",
    "Thanks! We'll respond within 24 hours.": "धन्यवाद! हम 24 घंटे में जवाब देंगे।",
    // final cta + footer
    "Ready to grow your restaurant?": "अपना रेस्टोरेंट बढ़ाने के लिए तैयार?",
    "Set up in minutes. No commission. Cancel anytime.": "मिनटों में सेटअप। कोई कमीशन नहीं। कभी भी बंद करें।",
    "Privacy Policy": "प्राइवेसी पॉलिसी", "Terms of Service": "सेवा की शर्तें", "All rights reserved.": "सर्वाधिकार सुरक्षित।",
    // agent
    "PlatesOS Agent": "PlatesOS एजेंट", "Online · replies fast": "ऑनलाइन · जल्दी जवाब", "typing…": "टाइप कर रहे हैं…",
    "Hi! I'm the PlatesOS Agent 👋": "नमस्ते! मैं PlatesOS एजेंट हूँ 👋",
    "Want to know more about our platform? Chat with us.": "हमारे प्लेटफ़ॉर्म के बारे में जानना चाहते हैं? हमसे चैट करें।",
    "Want to know more about our platform?": "हमारे प्लेटफ़ॉर्म के बारे में जानना चाहते हैं?",
    "Chat with us": "हमसे चैट करें", "💰 Pricing": "💰 प्राइसिंग", "📅 Book a demo": "📅 डेमो बुक करें", "📱 QR ordering": "📱 QR ऑर्डरिंग",
    "Language": "भाषा",
    // guided chat
    "What can I help you with today?": "आज मैं आपकी किस तरह मदद करूँ?",
    "💰 Pricing & plans": "💰 प्राइसिंग और प्लान", "🪧 QR table products": "🪧 QR टेबल प्रोडक्ट्स", "🛠️ Support": "🛠️ सपोर्ट",
    "How many outlets do you run?": "आपके कितने आउटलेट हैं?",
    "1 outlet": "1 आउटलेट", "2–5 outlets": "2–5 आउटलेट", "6+ outlets": "6+ आउटलेट",
    "What type of business is it?": "आपका बिज़नेस किस तरह का है?",
    "Café": "कैफ़े", "Restaurant": "रेस्टोरेंट", "Cloud kitchen": "क्लाउड किचन", "QSR / Fast food": "QSR / फ़ास्ट फ़ूड",
    "Which feature matters most to you?": "आपके लिए सबसे ज़रूरी फीचर कौन-सा है?",
    "Online ordering": "ऑनलाइन ऑर्डरिंग", "Table bookings": "टेबल बुकिंग", "Kitchen & reports": "किचन और रिपोर्ट",
    "Which product are you interested in?": "आप किस प्रोडक्ट में रुचि रखते हैं?", "Not sure yet": "अभी तय नहीं",
    "Roughly how many tables do you have?": "आपके पास लगभग कितनी टेबल हैं?", "Under 10": "10 से कम",
    "What is the issue about?": "समस्या किस बारे में है?",
    "Login / account": "लॉगिन / अकाउंट", "Orders or payments": "ऑर्डर या पेमेंट",
    "QR or menu setup": "QR या मेन्यू सेटअप", "Something else": "कुछ और",
    "Thanks! Tap below to continue on WhatsApp — our team will reply shortly.":
      "धन्यवाद! WhatsApp पर आगे बढ़ने के लिए नीचे टैप करें — हमारी टीम जल्द जवाब देगी।",
    "Continue on WhatsApp": "WhatsApp पर आगे बढ़ें", "Start over": "फिर से शुरू करें",
    // faq knowledge base — used by the agent bot
    // faq — features
    "What exactly does PlatesOS do?": "PlatesOS असल में क्या करता है?",
    "PlatesOS runs your day-to-day restaurant operations in one place — QR table ordering, online ordering, table bookings, kitchen tickets, billing, reports and invoices.": "PlatesOS आपके रेस्टोरेंट के रोज़ के काम एक ही जगह संभालता है — QR टेबल ऑर्डरिंग, ऑनलाइन ऑर्डरिंग, टेबल बुकिंग, किचन टिकट, बिलिंग, रिपोर्ट और इनवॉइस।",
    "How does QR table ordering work?": "QR टेबल ऑर्डरिंग कैसे काम करती है?",
    "Every table gets its own QR code. Guests scan, browse your live menu, order and pay from their phone, and the order reaches your kitchen with the table number already attached.": "हर टेबल का अपना QR कोड होता है। मेहमान स्कैन करते हैं, लाइव मेन्यू देखते हैं, अपने फ़ोन से ऑर्डर और पेमेंट करते हैं, और ऑर्डर टेबल नंबर के साथ सीधे किचन में पहुँच जाता है।",
    "Can guests pay from their own phone?": "क्या मेहमान अपने फ़ोन से पेमेंट कर सकते हैं?",
    "Yes. Guests can pay by UPI, card or wallet while ordering, or you can keep pay-at-counter on and collect at billing as usual.": "हाँ। मेहमान ऑर्डर करते समय UPI, कार्ड या वॉलेट से पेमेंट कर सकते हैं, या आप pay-at-counter चालू रखकर हमेशा की तरह बिलिंग पर पैसे ले सकते हैं।",
    "Can I update my menu and prices myself?": "क्या मैं अपना मेन्यू और दाम खुद अपडेट कर सकता हूँ?",
    "Yes. Items, prices, photos, add-ons and out-of-stock toggles update instantly across every table QR code and your online ordering page.": "हाँ। आइटम, दाम, फ़ोटो, ऐड-ऑन और आउट-ऑफ़-स्टॉक टॉगल हर टेबल QR कोड और आपके ऑनलाइन ऑर्डरिंग पेज पर तुरंत अपडेट हो जाते हैं।",
    "Does it work for multiple outlets or branches?": "क्या यह कई आउटलेट या शाखाओं के लिए काम करता है?",
    "Yes. The Enterprise plan adds multi-branch control from a single login, with branch-level menus and pricing plus consolidated reporting across outlets.": "हाँ। एंटरप्राइज़ प्लान में एक ही लॉगिन से मल्टी-ब्रांच कंट्रोल मिलता है — ब्रांच-वार मेन्यू और प्राइसिंग के साथ सभी आउटलेट की एक साथ रिपोर्टिंग।",
    "Do I get GST-ready invoices and reports?": "क्या GST-रेडी इनवॉइस और रिपोर्ट मिलती हैं?",
    "Yes. Every order produces a GST-ready invoice, and daily, item-wise and payment-mode reports can be viewed or exported at any time.": "हाँ। हर ऑर्डर पर GST-रेडी इनवॉइस बनती है, और डेली, आइटम-वार और पेमेंट-मोड रिपोर्ट कभी भी देख या एक्सपोर्ट कर सकते हैं।",
    "Do I need special hardware to use PlatesOS?": "PlatesOS के लिए कोई ख़ास हार्डवेयर चाहिए?",
    "No. PlatesOS runs in any modern browser — on a phone, tablet, laptop or your existing billing computer. A thermal printer and a kitchen display screen are optional.": "नहीं। PlatesOS किसी भी मॉडर्न ब्राउज़र में चलता है — फ़ोन, टैबलेट, लैपटॉप या आपके मौजूदा बिलिंग कंप्यूटर पर। थर्मल प्रिंटर और किचन डिस्प्ले स्क्रीन ज़रूरी नहीं हैं।",
    // faq — pricing
    "Do you charge commission on orders?": "क्या आप ऑर्डर पर कमीशन लेते हैं?",
    "Never. You keep 100% of every order value and pay only a flat monthly plan fee, no matter how many orders you take.": "कभी नहीं। हर ऑर्डर की पूरी रकम आपकी रहती है — आप सिर्फ़ एक फ़िक्स मंथली प्लान फ़ीस देते हैं, चाहे ऑर्डर कितने भी हों।",
    "Is there a free trial?": "क्या फ्री ट्रायल मिलता है?",
    "Yes — a {days}-day free trial on every plan. You can explore the full product first and cancel any time before the trial ends.": "हाँ — हर प्लान पर {days} दिन का फ्री ट्रायल। पहले पूरा प्रोडक्ट इस्तेमाल करें और ट्रायल ख़त्म होने से पहले कभी भी कैंसिल कर सकते हैं।",
    "Which plan should I start with?": "मुझे कौन सा प्लान लेना चाहिए?",
    "Starter fits a single-outlet café, Growth fits a busy restaurant that needs online ordering and a kitchen display, and Enterprise fits chains and multi-branch operations.": "स्टार्टर एक आउटलेट वाले कैफ़े के लिए, ग्रोथ उस व्यस्त रेस्टोरेंट के लिए जिसे ऑनलाइन ऑर्डरिंग और किचन डिस्प्ले चाहिए, और एंटरप्राइज़ चेन व मल्टी-ब्रांच के लिए।",
    "Can I change or cancel my plan later?": "क्या मैं बाद में प्लान बदल या कैंसिल कर सकता हूँ?",
    "Yes. Upgrade, downgrade or cancel from your dashboard whenever you like — changes take effect from your next billing cycle.": "हाँ। डैशबोर्ड से जब चाहें अपग्रेड, डाउनग्रेड या कैंसिल करें — बदलाव आपके अगले बिलिंग साइकल से लागू होंगे।",
    // faq — setup
    "How long does setup take?": "सेटअप में कितना समय लगता है?",
    "Most restaurants go live the same day. Once your menu is in, your table QR codes and ordering page are generated straight away.": "ज़्यादातर रेस्टोरेंट उसी दिन लाइव हो जाते हैं। मेन्यू अपलोड होने के बाद आपके टेबल QR कोड और ऑर्डरिंग पेज तुरंत बन जाते हैं।",
    "Do you help with menu upload and onboarding?": "क्या आप मेन्यू अपलोड और ऑनबोर्डिंग में मदद करते हैं?",
    "Yes. Share your existing menu in any format — PDF, Excel or even photos — and our team sets it up and walks your staff through the basics.": "हाँ। अपना मौजूदा मेन्यू किसी भी फ़ॉर्मैट में भेजें — PDF, Excel या फ़ोटो — हमारी टीम उसे सेट कर देती है और आपके स्टाफ़ को बेसिक चीज़ें सिखा देती है।",
    "Can I keep my current POS or billing software?": "क्या मैं अपना मौजूदा POS या बिलिंग सॉफ़्टवेयर रख सकता हूँ?",
    "In most cases yes — PlatesOS can run alongside your billing system while orders flow in digitally. Tell us what you use and we'll confirm before you commit.": "अक्सर हाँ — PlatesOS आपके बिलिंग सिस्टम के साथ-साथ चल सकता है और ऑर्डर डिजिटली आते रहते हैं। हमें बताएं आप क्या इस्तेमाल करते हैं, हम पहले कन्फ़र्म कर देंगे।",
    // faq — products
    "What QR table products do you supply?": "आप कौन-कौन से QR टेबल प्रोडक्ट देते हैं?",
    "Table tents, tissue-box holders and condiment-caddy wraps, each printed with your branding and a QR code mapped to a specific table.": "टेबल टेंट, टिश्यू-बॉक्स होल्डर और कॉन्डिमेंट-कैडी रैप — हर एक पर आपकी ब्रांडिंग और उस टेबल का QR कोड छपा होता है।",
    "Is the printing customised to my brand?": "क्या प्रिंटिंग मेरी ब्रांड के हिसाब से होती है?",
    "Yes. Your logo, colours and a short call-to-action go on every piece, and you approve a digital proof before anything goes to print.": "हाँ। हर पीस पर आपका लोगो, रंग और एक छोटा कॉल-टू-एक्शन होता है, और प्रिंट से पहले आप डिजिटल प्रूफ़ अप्रूव करते हैं।",
    "How do I order QR table products?": "QR टेबल प्रोडक्ट कैसे ऑर्डर करें?",
    "Pick a product in the Products section above, tell us your table count, and we'll send a quote with pricing and delivery timelines.": "ऊपर प्रोडक्ट्स सेक्शन में प्रोडक्ट चुनें, हमें अपने टेबल की संख्या बताएं, और हम प्राइसिंग व डिलीवरी टाइमलाइन के साथ कोटेशन भेज देंगे।",
    // faq — support
    "How do I reach your support team?": "सपोर्ट टीम से कैसे संपर्क करें?",
    "Email {email} and we respond within 24 hours, or call {phone} between Mon – Fri, 9:00 AM – 6:00 PM. WhatsApp works too.": "{email} पर ईमेल करें — हम 24 घंटे में जवाब देते हैं — या सोम – शुक्र, सुबह 9:00 से शाम 6:00 के बीच {phone} पर कॉल करें। WhatsApp भी चलेगा।",
    "Where are you based?": "आप कहाँ से काम करते हैं?",
    "We're based in {location}, and remote support is available across the country — so your location is never a problem.": "हम {location} से हैं, और पूरे देश में रिमोट सपोर्ट उपलब्ध है — इसलिए आपकी लोकेशन कभी दिक़्क़त नहीं बनती।",
    "Is my restaurant's data safe?": "क्या मेरे रेस्टोरेंट का डेटा सुरक्षित है?",
    "Your data stays yours. It is stored on encrypted servers, access is limited by staff role, and you can export or request deletion of your data at any time.": "आपका डेटा आपका ही रहता है। यह एन्क्रिप्टेड सर्वर पर स्टोर होता है, एक्सेस स्टाफ़ रोल के हिसाब से सीमित रहता है, और आप कभी भी डेटा एक्सपोर्ट या डिलीट करवा सकते हैं।",
    // faq — ask box
    // faq — more answers
    "Do my customers need to download an app?": "क्या ग्राहकों को कोई ऐप डाउनलोड करना पड़ेगा?",
    "No. Guests scan the QR code and your menu opens in their phone's browser — there is nothing to download, install or sign up for.": "नहीं। मेहमान QR कोड स्कैन करते हैं और मेन्यू उनके फ़ोन के ब्राउज़र में खुल जाता है — कुछ डाउनलोड, इंस्टॉल या साइन-अप करने की ज़रूरत नहीं।",
    "Which payment modes are supported?": "कौन-कौन से पेमेंट मोड सपोर्ट होते हैं?",
    "UPI, credit and debit cards, popular wallets, and cash at the counter — and every payment is tagged by mode in your reports.": "UPI, क्रेडिट और डेबिट कार्ड, लोकप्रिय वॉलेट, और काउंटर पर कैश — और हर पेमेंट रिपोर्ट में उसके मोड के साथ दर्ज होता है।",
    "Can I take table bookings and reservations online?": "क्या मैं ऑनलाइन टेबल बुकिंग ले सकता हूँ?",
    "Yes. Guests can request a table from your page, and you confirm, move or cancel bookings on a live floor plan that shows which tables are free.": "हाँ। मेहमान आपके पेज से टेबल की रिक्वेस्ट भेज सकते हैं, और आप लाइव फ़्लोर प्लान पर बुकिंग कन्फ़र्म, बदल या कैंसिल कर सकते हैं जिसमें ख़ाली टेबल दिखते हैं।",
    "Can I see live table status and a floor plan?": "क्या लाइव टेबल स्टेटस और फ़्लोर प्लान दिखता है?",
    "Yes. The floor plan shows which tables are occupied, which have ordered and which are waiting to pay, updating as orders come in.": "हाँ। फ़्लोर प्लान बताता है कौन सी टेबल भरी है, किसने ऑर्डर किया है और कौन पेमेंट के इंतज़ार में है — ऑर्डर आते ही यह अपडेट होता रहता है।",
    "Does PlatesOS handle delivery and takeaway orders?": "क्या PlatesOS डिलीवरी और टेकअवे ऑर्डर संभालता है?",
    "Yes. Your online ordering page accepts delivery and takeaway orders directly, with no commission taken on any of them.": "हाँ। आपका ऑनलाइन ऑर्डरिंग पेज डिलीवरी और टेकअवे ऑर्डर सीधे लेता है, और उन पर कोई कमीशन नहीं लगता।",
    "Does it print KOT tickets for the kitchen?": "क्या किचन के लिए KOT प्रिंट होता है?",
    "Yes. Connect any standard thermal printer and each order prints as a KOT — or skip paper entirely and use the kitchen display screen instead.": "हाँ। किसी भी सामान्य थर्मल प्रिंटर को जोड़ें और हर ऑर्डर KOT के रूप में प्रिंट होगा — या कागज़ छोड़कर किचन डिस्प्ले स्क्रीन इस्तेमाल करें।",
    "Can I run offers, coupons and discounts?": "क्या मैं ऑफ़र, कूपन और डिस्काउंट चला सकता हूँ?",
    "Yes. Create percentage or flat-value coupons, happy-hour offers and item-level discounts, and switch them on or off whenever you like.": "हाँ। परसेंटेज या फ़्लैट-वैल्यू कूपन, हैपी-आवर ऑफ़र और आइटम-लेवल डिस्काउंट बनाएं, और जब चाहें चालू या बंद करें।",
    "Can I manage staff accounts and permissions?": "क्या मैं स्टाफ़ अकाउंट और परमिशन मैनेज कर सकता हूँ?",
    "Yes. Add managers, cashiers and kitchen staff with role-based access, so each person only sees the screens they need.": "हाँ। मैनेजर, कैशियर और किचन स्टाफ़ को रोल-आधारित एक्सेस के साथ जोड़ें, जिससे हर व्यक्ति को सिर्फ़ ज़रूरी स्क्रीन दिखें।",
    "Can I track daily sales and best-selling items?": "क्या मैं रोज़ की सेल और बेस्ट-सेलिंग आइटम ट्रैक कर सकता हूँ?",
    "Yes. The dashboard shows today's sales, order count and average bill value, along with your best-selling and slowest-moving items.": "हाँ। डैशबोर्ड पर आज की सेल, ऑर्डर की संख्या और औसत बिल वैल्यू के साथ सबसे ज़्यादा और सबसे कम बिकने वाले आइटम दिखते हैं।",
    "Can I show my menu in more than one language?": "क्या मेन्यू एक से ज़्यादा भाषाओं में दिखा सकते हैं?",
    "Yes. Item names and descriptions can be entered in the language your guests read, and this site itself is available in English, Hindi, Marathi and Kannada.": "हाँ। आइटम के नाम और विवरण उसी भाषा में डाल सकते हैं जो आपके मेहमान पढ़ते हैं, और यह साइट ख़ुद अंग्रेज़ी, हिंदी, मराठी और कन्नड़ में उपलब्ध है।",
    "What happens if my internet goes down?": "अगर इंटरनेट बंद हो जाए तो क्या होगा?",
    "PlatesOS is cloud-based, so it needs a connection. Guests order over their own mobile data, so table ordering keeps working even when your Wi-Fi drops — keep a backup hotspot for billing.": "PlatesOS क्लाउड-आधारित है, इसलिए कनेक्शन ज़रूरी है। मेहमान अपने मोबाइल डेटा से ऑर्डर करते हैं, इसलिए आपका Wi-Fi बंद होने पर भी टेबल ऑर्डरिंग चलती रहती है — बिलिंग के लिए बैकअप हॉटस्पॉट रखें।",
    "How much does PlatesOS cost?": "PlatesOS की कीमत कितनी है?",
    "Starter is ₹999 a month and Growth is ₹2,499 a month, both billed flat with no commission. Enterprise is priced to your chain — talk to sales for a quote.": "स्टार्टर ₹999 प्रति महीना और ग्रोथ ₹2,499 प्रति महीना — दोनों फ़िक्स फ़ीस, कोई कमीशन नहीं। एंटरप्राइज़ की कीमत आपकी चेन के हिसाब से तय होती है — कोटेशन के लिए सेल्स से बात करें।",
    "Are there any setup or hidden fees?": "क्या कोई सेटअप या छिपा हुआ चार्ज है?",
    "No setup fee and no hidden charges — your plan price is what you pay. Printed QR table products are the only separate, optional cost.": "कोई सेटअप फ़ीस नहीं और कोई छिपा चार्ज नहीं — जो प्लान की कीमत है, वही आप देते हैं। सिर्फ़ प्रिंटेड QR टेबल प्रोडक्ट अलग और वैकल्पिक खर्च हैं।",
    "How can I pay for my subscription?": "सब्सक्रिप्शन का पेमेंट कैसे करें?",
    "UPI, credit or debit card, net banking and bank transfer are all accepted, and you get a GST invoice for every payment.": "UPI, क्रेडिट या डेबिट कार्ड, नेट बैंकिंग और बैंक ट्रांसफ़र — सब स्वीकार हैं, और हर पेमेंट पर GST इनवॉइस मिलती है।",
    "What is your refund and cancellation policy?": "रिफ़ंड और कैंसिलेशन पॉलिसी क्या है?",
    "The {days}-day trial means you only pay once you're sure. After that you can cancel any time and you won't be billed from the next cycle — write to support for anything specific to your account.": "{days} दिन के ट्रायल का मतलब है कि आप तभी पैसे देते हैं जब पूरी तरह आश्वस्त हों। उसके बाद कभी भी कैंसिल करें और अगले साइकल से बिलिंग नहीं होगी — अपने अकाउंट से जुड़ी किसी ख़ास बात के लिए सपोर्ट को लिखें।",
    "Is there a discount for annual billing or multiple outlets?": "सालाना बिलिंग या कई आउटलेट पर डिस्काउंट मिलता है?",
    "Yes — annual plans and multi-outlet accounts are priced lower per outlet. Tell us your outlet count and we'll share a quote.": "हाँ — सालाना प्लान और मल्टी-आउटलेट अकाउंट पर प्रति आउटलेट कीमत कम होती है। अपने आउटलेट की संख्या बताएं, हम कोटेशन भेज देंगे।",
    "Can I try PlatesOS before paying?": "पैसे देने से पहले PlatesOS आज़मा सकता हूँ?",
    "Yes. Start a {days}-day free trial with no card details, set up your real menu, and decide at the end of it.": "हाँ। बिना कार्ड डिटेल {days} दिन का फ्री ट्रायल शुरू करें, अपना असली मेन्यू सेट करें, और अंत में फ़ैसला लें।",
    "Can I book a demo with your team?": "क्या मैं आपकी टीम के साथ डेमो बुक कर सकता हूँ?",
    "Yes. Pick “Book a demo” in the contact form or message us on WhatsApp, and we'll walk you through the product on a call at a time that suits you.": "हाँ। कॉन्टैक्ट फ़ॉर्म में “डेमो बुक करें” चुनें या WhatsApp पर मैसेज करें — हम आपके समय के अनुसार कॉल पर पूरा प्रोडक्ट दिखा देंगे।",
    "Do you train my staff on the system?": "क्या आप मेरे स्टाफ़ को ट्रेनिंग देते हैं?",
    "Yes. We run a short walkthrough for your managers and kitchen staff, and leave you with simple guides they can refer back to.": "हाँ। हम आपके मैनेजर और किचन स्टाफ़ के लिए छोटा वॉकथ्रू करते हैं, और आसान गाइड दे देते हैं जिन्हें वे बाद में देख सकते हैं।",
    "How do I get my table QR codes printed?": "टेबल QR कोड कैसे प्रिंट कराएं?",
    "Download print-ready QR PDFs from your dashboard and use any local printer, or order our printed table tents, tissue boxes and condiment caddies.": "डैशबोर्ड से प्रिंट-रेडी QR PDF डाउनलोड करें और किसी भी लोकल प्रिंटर से छपवाएं, या हमारे प्रिंटेड टेबल टेंट, टिश्यू बॉक्स और कॉन्डिमेंट कैडी ऑर्डर करें।",
    "How quickly do you reply to support requests?": "सपोर्ट रिक्वेस्ट का जवाब कितनी जल्दी मिलता है?",
    "Email gets a reply within 24 hours, and WhatsApp or phone is usually answered within the same working hour, Mon – Fri, 9:00 AM – 6:00 PM.": "ईमेल का जवाब 24 घंटे में मिलता है, और WhatsApp या फ़ोन पर सोम – शुक्र, सुबह 9:00 से शाम 6:00 के बीच आमतौर पर उसी घंटे में जवाब मिल जाता है।",
    "Which languages is PlatesOS available in?": "PlatesOS किन भाषाओं में उपलब्ध है?",
    "The platform and this site are available in English, Hindi, Marathi and Kannada, and support is available in all four.": "प्लेटफ़ॉर्म और यह साइट अंग्रेज़ी, हिंदी, मराठी और कन्नड़ में उपलब्ध हैं, और सपोर्ट भी चारों भाषाओं में मिलता है।",
    // agent bot copy
    "💬 Ask a question": "💬 सवाल पूछें",
    "Chat with our team": "हमारी टीम से चैट करें",
    "Pick a topic, or tap a popular question.": "कोई विषय चुनें, या नीचे दिए लोकप्रिय सवाल पर टैप करें।",
    "Popular": "लोकप्रिय",
    "Browse by topic": "विषय के अनुसार देखें",
    "Other topics": "दूसरे विषय",
    "Setup": "सेटअप",
  },
  mr: {
    "Home": "होम", "Features": "वैशिष्ट्ये", "Products": "प्रॉडक्ट्स", "Pricing": "किंमत",
    "About": "आमच्याविषयी", "Contact": "संपर्क", "Sign in": "साइन इन", "Get started": "सुरू करा",
    "Modern Restaurant Management Platform": "आधुनिक रेस्टॉरंट मॅनेजमेंट प्लॅटफॉर्म",
    "Run Your Restaurant.": "तुमचं रेस्टॉरंट चालवा.", "Smarter.": "अधिक स्मार्टपणे.",
    "One powerful platform to manage orders, tables, bookings, QR ordering, and daily operations — all in one place.":
      "ऑर्डर, टेबल, बुकिंग, QR ऑर्डरिंग आणि रोजचं कामकाज — सर्व काही एकाच सशक्त प्लॅटफॉर्मवर.",
    "Start free trial": "मोफत ट्रायल सुरू करा", "Watch video": "व्हिडिओ पाहा",
    "No commission": "कमिशन नाही", "{days}-day free trial": "{days} दिवस मोफत ट्रायल", "Easy setup": "सोपा सेटअप",
    "Dashboard": "डॅशबोर्ड", "QR Table Ordering": "QR टेबल ऑर्डरिंग", "Online Ordering": "ऑनलाइन ऑर्डरिंग",
    "Kitchen Operations": "किचन ऑपरेशन्स", "Analytics": "अ‍ॅनालिटिक्स",
    "Everything you need": "तुम्हाला हवं ते सर्व",
    "Powerful features for": "तुमच्या रेस्टॉरंटसाठी", "your restaurant": "सशक्त वैशिष्ट्ये",
    "From online orders to detailed reports, PlatesOS gives you the tools to run your restaurant smoothly and efficiently.":
      "ऑनलाइन ऑर्डरपासून सविस्तर अहवालांपर्यंत, PlatesOS तुम्हाला रेस्टॉरंट सहज चालवण्याची साधनं देतं.",
    "Let customers order from anywhere.": "ग्राहक कुठूनही ऑर्डर करू शकतात.",
    "Delivery & takeaway": "डिलिव्हरी आणि टेकअवे",
    "Unique QR codes for every table.": "प्रत्येक टेबलसाठी वेगळा QR कोड.", "Scan · Order · Pay": "स्कॅन · ऑर्डर · पेमेंट",
    "Table & Booking Management": "टेबल आणि बुकिंग व्यवस्थापन",
    "Manage reservations and table allocation.": "रिझर्व्हेशन आणि टेबल वाटप सांभाळा.", "Live floor plan": "लाइव्ह फ्लोअर प्लॅन",
    "Restaurant Dashboard": "रेस्टॉरंट डॅशबोर्ड",
    "Track orders, sales, and performance in real-time.": "ऑर्डर, विक्री आणि कामगिरी रिअल-टाइममध्ये पाहा.", "Real-time": "रिअल-टाइम",
    "Orders, Reports & Invoices": "ऑर्डर, अहवाल आणि इनव्हॉइस",
    "Stay organized with detailed reports.": "सविस्तर अहवालांसह सर्व व्यवस्थित ठेवा.", "GST-ready invoices": "GST-रेडी इनव्हॉइस",
    "No Commission": "कमिशन नाही", "Keep 100% of your earnings.": "तुमची संपूर्ण कमाई तुमच्याकडेच.", "0% per order": "प्रत्येक ऑर्डरवर 0%",
    "On every table": "प्रत्येक टेबलावर",
    "Premium QR products for": "तुमच्या टेबलसाठी", "your tables": "प्रीमियम QR प्रॉडक्ट्स",
    "Printed once, branded to your restaurant, and built to survive daily service. Every product links straight to your PlatesOS menu.":
      "एकदाच छपाई, तुमच्या रेस्टॉरंटचं ब्रँडिंग आणि रोजच्या वापरासाठी टिकाऊ. प्रत्येक प्रॉडक्ट थेट तुमच्या PlatesOS मेन्यूशी जोडलेलं.",
    "Condiment Holder QR": "कंडिमेंट होल्डर QR", "Best seller": "सर्वाधिक लोकप्रिय",
    "One caddy for spoons, forks, salt, pepper and napkins — with your ordering QR printed on the front face.":
      "चमचे, काटे, मीठ, मिरी आणि नॅपकिनसाठी एकच स्टँड — पुढच्या बाजूला तुमचा ऑर्डरिंग QR छापलेला.",
    "L-Shaped Table Tent QR": "L-आकाराचा टेबल टेंट QR", "Table numbering": "टेबल क्रमांक",
    "Slim L-stand printed with your table number on both faces, so guests and servers always know the table.":
      "बारीक L-स्टँड, दोन्ही बाजूंना टेबल क्रमांक छापलेला — ग्राहक आणि स्टाफला टेबल लगेच कळतं.",
    "Tissue Box QR Branding": "टिश्यू बॉक्स QR ब्रँडिंग", "Everyday branding": "रोजचं ब्रँडिंग",
    "Custom-printed tissue boxes carrying your logo and ordering QR — useful on the table, seen at every meal.":
      "तुमचा लोगो आणि ऑर्डरिंग QR असलेले कस्टम-प्रिंटेड टिश्यू बॉक्स — टेबलावर उपयुक्त, प्रत्येक वेळी नजरेत.",
    "Get This for My Restaurant": "माझ्या रेस्टॉरंटसाठी हवं",
    "Front": "पुढे", "Back": "मागे", "Left": "डावी", "Right": "उजवी",
    "Product images are indicative mockups — hover or tap the arrows to see all four sides. Custom sizes, colours and branding available on request.":
      "प्रॉडक्ट प्रतिमा प्रातिनिधिक मॉकअप आहेत — चारही बाजू पाहण्यासाठी बाणांवर टॅप करा. कस्टम आकार, रंग आणि ब्रँडिंग मागणीनुसार उपलब्ध.",
    "Why choose PlatesOS": "PlatesOS का निवडावं",
    "Built for modern": "आधुनिक रेस्टॉरंटसाठी", "restaurants": "तयार केलेलं",
    "Simple to use, powerful behind the scenes, and designed to help you serve better, manage easier, and grow faster.":
      "वापरायला सोपं, आतून सशक्त — उत्तम सेवा, सोपं व्यवस्थापन आणि वेगवान वाढीसाठी.",
    "Easy setup & onboarding": "सोपा सेटअप आणि ऑनबोर्डिंग", "Dedicated support": "समर्पित सपोर्ट",
    "Scalable for single or multi-branch restaurants": "एक किंवा अनेक शाखा असलेल्या रेस्टॉरंटसाठी योग्य",
    "Trusted by modern food businesses": "आधुनिक फूड व्यवसायांचा विश्वास",
    "New Order": "नवीन ऑर्डर", "New Booking": "नवीन बुकिंग", "Daily Report Ready": "दैनिक अहवाल तयार",
    "Simple pricing": "सोपी किंमत", "Plans that grow": "तुमच्यासोबत वाढणारे", "with you": "प्लॅन",
    "No commission on orders. {days}-day free trial on every plan.": "ऑर्डरवर कमिशन नाही. प्रत्येक प्लॅनवर {days} दिवस मोफत ट्रायल.",
    "Starter": "स्टार्टर", "For single-outlet cafés": "एकाच आउटलेटच्या कॅफेसाठी",
    "QR table ordering": "QR टेबल ऑर्डरिंग", "Online menu": "ऑनलाइन मेन्यू", "Basic reports": "बेसिक अहवाल", "Email support": "ईमेल सपोर्ट",
    "Growth": "ग्रोथ", "For busy restaurants": "व्यस्त रेस्टॉरंटसाठी", "Everything in Starter": "स्टार्टरमधील सर्व काही",
    "Online ordering website": "ऑनलाइन ऑर्डरिंग वेबसाइट", "Kitchen display": "किचन डिस्प्ले",
    "Enterprise": "एंटरप्राइझ", "For chains & multi-branch": "चेन आणि अनेक शाखांसाठी", "Everything in Growth": "ग्रोथमधील सर्व काही",
    "Multi-branch control": "मल्टी-ब्रँच नियंत्रण", "Advanced analytics": "प्रगत अ‍ॅनालिटिक्स", "Dedicated manager": "समर्पित मॅनेजर",
    "Most popular": "सर्वाधिक लोकप्रिय", "/month": "/महिना", "Talk to sales": "सेल्सशी बोला", "Custom": "कस्टम",
    "Get in touch": "संपर्क साधा", "Us": "करा",
    "We'd love to hear from you! Whether you have a question, need support, or want to partner with us — we're here to help.":
      "तुमच्याकडून ऐकायला आवडेल! प्रश्न असो, सपोर्ट हवा असो किंवा भागीदारी — आम्ही मदतीसाठी आहोत.",
    "Email": "ईमेल", "We'll respond within 24 hours.": "आम्ही 24 तासांत उत्तर देऊ.",
    "Phone": "फोन", "Mon – Fri, 9:00 AM – 6:00 PM": "सोम – शुक्र, सकाळी 9:00 – संध्याकाळी 6:00",
    "Location": "पत्ता", "(Remote support available)": "(रिमोट सपोर्ट उपलब्ध)",
    "Send us a message": "आम्हाला संदेश पाठवा", "Full name": "पूर्ण नाव", "Your name": "तुमचं नाव",
    "Restaurant name": "रेस्टॉरंटचं नाव", "Subject": "विषय", "Select an option": "पर्याय निवडा",
    "Book a demo": "डेमो बुक करा", "Support": "सपोर्ट", "Partnership": "भागीदारी",
    "Message": "संदेश", "How can we help you?": "आम्ही कशी मदत करू शकतो?",
    "Send message": "संदेश पाठवा", "Sending…": "पाठवत आहे…",
    "Name is required": "नाव आवश्यक आहे", "Enter a valid email": "वैध ईमेल टाका", "Enter a valid phone": "वैध फोन नंबर टाका",
    "Choose a subject": "विषय निवडा", "Message must be at least 10 characters": "संदेश किमान 10 अक्षरांचा हवा",
    "Message must be under 5000 characters": "संदेश 5000 अक्षरांपेक्षा कमी असावा",
    "Couldn't send your message. Please try again.": "तुमचा संदेश पाठवता आला नाही. कृपया पुन्हा प्रयत्न करा.",
    "Or email us at": "किंवा आम्हाला ईमेल करा:",
    "Thanks! We'll respond within 24 hours.": "धन्यवाद! आम्ही 24 तासांत उत्तर देऊ.",
    "Ready to grow your restaurant?": "तुमचं रेस्टॉरंट वाढवायला तयार?",
    "Set up in minutes. No commission. Cancel anytime.": "काही मिनिटांत सेटअप. कमिशन नाही. कधीही रद्द करा.",
    "Privacy Policy": "प्रायव्हसी पॉलिसी", "Terms of Service": "सेवा अटी", "All rights reserved.": "सर्व हक्क राखीव.",
    "PlatesOS Agent": "PlatesOS एजंट", "Online · replies fast": "ऑनलाइन · लवकर उत्तर", "typing…": "टाइप करत आहे…",
    "Hi! I'm the PlatesOS Agent 👋": "नमस्कार! मी PlatesOS एजंट आहे 👋",
    "Want to know more about our platform? Chat with us.": "आमच्या प्लॅटफॉर्मबद्दल अधिक जाणून घ्यायचंय? आमच्याशी चॅट करा.",
    "Want to know more about our platform?": "आमच्या प्लॅटफॉर्मबद्दल अधिक जाणून घ्यायचंय?",
    "Chat with us": "आमच्याशी चॅट करा", "💰 Pricing": "💰 किंमत", "📅 Book a demo": "📅 डेमो बुक करा", "📱 QR ordering": "📱 QR ऑर्डरिंग",
    "Language": "भाषा",
    // guided chat
    "What can I help you with today?": "आज मी तुम्हाला कशी मदत करू?",
    "💰 Pricing & plans": "💰 किंमत आणि प्लॅन", "🪧 QR table products": "🪧 QR टेबल प्रॉडक्ट्स", "🛠️ Support": "🛠️ सपोर्ट",
    "How many outlets do you run?": "तुमचे किती आउटलेट आहेत?",
    "1 outlet": "1 आउटलेट", "2–5 outlets": "2–5 आउटलेट", "6+ outlets": "6+ आउटलेट",
    "What type of business is it?": "तुमचा व्यवसाय कोणत्या प्रकारचा आहे?",
    "Café": "कॅफे", "Restaurant": "रेस्टॉरंट", "Cloud kitchen": "क्लाउड किचन", "QSR / Fast food": "QSR / फास्ट फूड",
    "Which feature matters most to you?": "तुमच्यासाठी सर्वात महत्त्वाचं वैशिष्ट्य कोणतं?",
    "Online ordering": "ऑनलाइन ऑर्डरिंग", "Table bookings": "टेबल बुकिंग", "Kitchen & reports": "किचन आणि अहवाल",
    "Which product are you interested in?": "तुम्हाला कोणतं प्रॉडक्ट हवं आहे?", "Not sure yet": "अजून ठरलं नाही",
    "Roughly how many tables do you have?": "तुमच्याकडे साधारण किती टेबल आहेत?", "Under 10": "10 पेक्षा कमी",
    "What is the issue about?": "समस्या कशाबद्दल आहे?",
    "Login / account": "लॉगिन / अकाउंट", "Orders or payments": "ऑर्डर किंवा पेमेंट",
    "QR or menu setup": "QR किंवा मेन्यू सेटअप", "Something else": "इतर काही",
    "Thanks! Tap below to continue on WhatsApp — our team will reply shortly.":
      "धन्यवाद! WhatsApp वर पुढे जाण्यासाठी खाली टॅप करा — आमची टीम लवकरच उत्तर देईल.",
    "Continue on WhatsApp": "WhatsApp वर पुढे जा", "Start over": "पुन्हा सुरू करा",
    // faq knowledge base — used by the agent bot
    // faq — features
    "What exactly does PlatesOS do?": "PlatesOS नेमकं काय करतं?",
    "PlatesOS runs your day-to-day restaurant operations in one place — QR table ordering, online ordering, table bookings, kitchen tickets, billing, reports and invoices.": "PlatesOS तुमच्या रेस्टॉरंटचं रोजचं कामकाज एकाच ठिकाणी सांभाळतं — QR टेबल ऑर्डरिंग, ऑनलाइन ऑर्डरिंग, टेबल बुकिंग, किचन तिकिटं, बिलिंग, अहवाल आणि इनव्हॉइस.",
    "How does QR table ordering work?": "QR टेबल ऑर्डरिंग कशी चालते?",
    "Every table gets its own QR code. Guests scan, browse your live menu, order and pay from their phone, and the order reaches your kitchen with the table number already attached.": "प्रत्येक टेबलला स्वतःचा QR कोड असतो. पाहुणे स्कॅन करतात, लाइव्ह मेन्यू पाहतात, फोनवरून ऑर्डर आणि पेमेंट करतात, आणि ऑर्डर टेबल नंबरसह थेट किचनमध्ये पोहोचते.",
    "Can guests pay from their own phone?": "पाहुणे स्वतःच्या फोनवरून पेमेंट करू शकतात का?",
    "Yes. Guests can pay by UPI, card or wallet while ordering, or you can keep pay-at-counter on and collect at billing as usual.": "हो. पाहुणे ऑर्डर करताना UPI, कार्ड किंवा वॉलेटने पेमेंट करू शकतात, किंवा तुम्ही pay-at-counter सुरू ठेवून नेहमीप्रमाणे बिलिंगला पैसे घेऊ शकता.",
    "Can I update my menu and prices myself?": "मी माझा मेन्यू आणि किंमती स्वतः अपडेट करू शकतो का?",
    "Yes. Items, prices, photos, add-ons and out-of-stock toggles update instantly across every table QR code and your online ordering page.": "हो. आयटम, किंमती, फोटो, अ‍ॅड-ऑन आणि आउट-ऑफ-स्टॉक टॉगल प्रत्येक टेबल QR कोड आणि तुमच्या ऑनलाइन ऑर्डरिंग पेजवर लगेच अपडेट होतात.",
    "Does it work for multiple outlets or branches?": "अनेक आउटलेट किंवा शाखांसाठी हे चालतं का?",
    "Yes. The Enterprise plan adds multi-branch control from a single login, with branch-level menus and pricing plus consolidated reporting across outlets.": "हो. एंटरप्राइझ प्लॅनमध्ये एकाच लॉगिनमधून मल्टी-ब्रँच नियंत्रण मिळतं — शाखानिहाय मेन्यू व किंमतींसह सर्व आउटलेटचा एकत्रित अहवाल.",
    "Do I get GST-ready invoices and reports?": "GST-रेडी इनव्हॉइस आणि अहवाल मिळतात का?",
    "Yes. Every order produces a GST-ready invoice, and daily, item-wise and payment-mode reports can be viewed or exported at any time.": "हो. प्रत्येक ऑर्डरवर GST-रेडी इनव्हॉइस तयार होते, आणि दैनिक, आयटमनिहाय व पेमेंट-मोड अहवाल कधीही पाहता किंवा एक्सपोर्ट करता येतात.",
    "Do I need special hardware to use PlatesOS?": "PlatesOS वापरण्यासाठी खास हार्डवेअर लागतं का?",
    "No. PlatesOS runs in any modern browser — on a phone, tablet, laptop or your existing billing computer. A thermal printer and a kitchen display screen are optional.": "नाही. PlatesOS कोणत्याही आधुनिक ब्राउझरमध्ये चालतं — फोन, टॅबलेट, लॅपटॉप किंवा तुमच्या सध्याच्या बिलिंग संगणकावर. थर्मल प्रिंटर आणि किचन डिस्प्ले स्क्रीन ऐच्छिक आहेत.",
    // faq — pricing
    "Do you charge commission on orders?": "तुम्ही ऑर्डरवर कमिशन घेता का?",
    "Never. You keep 100% of every order value and pay only a flat monthly plan fee, no matter how many orders you take.": "कधीच नाही. प्रत्येक ऑर्डरची पूर्ण रक्कम तुमचीच राहते — तुम्ही फक्त ठरलेली मासिक प्लॅन फी भरता, ऑर्डर कितीही असले तरी.",
    "Is there a free trial?": "मोफत ट्रायल आहे का?",
    "Yes — a {days}-day free trial on every plan. You can explore the full product first and cancel any time before the trial ends.": "हो — प्रत्येक प्लॅनवर {days} दिवसांची मोफत ट्रायल. आधी संपूर्ण प्रॉडक्ट वापरून पाहा आणि ट्रायल संपण्यापूर्वी कधीही रद्द करा.",
    "Which plan should I start with?": "मी कोणत्या प्लॅनने सुरुवात करावी?",
    "Starter fits a single-outlet café, Growth fits a busy restaurant that needs online ordering and a kitchen display, and Enterprise fits chains and multi-branch operations.": "स्टार्टर एकाच आउटलेटच्या कॅफेसाठी, ग्रोथ ऑनलाइन ऑर्डरिंग व किचन डिस्प्ले हवं असलेल्या व्यस्त रेस्टॉरंटसाठी, आणि एंटरप्राइझ चेन व अनेक शाखांसाठी.",
    "Can I change or cancel my plan later?": "मी नंतर प्लॅन बदलू किंवा रद्द करू शकतो का?",
    "Yes. Upgrade, downgrade or cancel from your dashboard whenever you like — changes take effect from your next billing cycle.": "हो. डॅशबोर्डवरून कधीही अपग्रेड, डाउनग्रेड किंवा रद्द करा — बदल पुढच्या बिलिंग सायकलपासून लागू होतात.",
    // faq — setup
    "How long does setup take?": "सेटअपला किती वेळ लागतो?",
    "Most restaurants go live the same day. Once your menu is in, your table QR codes and ordering page are generated straight away.": "बहुतेक रेस्टॉरंट त्याच दिवशी लाइव्ह होतात. मेन्यू अपलोड झाल्यावर तुमचे टेबल QR कोड आणि ऑर्डरिंग पेज लगेच तयार होतात.",
    "Do you help with menu upload and onboarding?": "मेन्यू अपलोड आणि ऑनबोर्डिंगमध्ये तुम्ही मदत करता का?",
    "Yes. Share your existing menu in any format — PDF, Excel or even photos — and our team sets it up and walks your staff through the basics.": "हो. तुमचा सध्याचा मेन्यू कोणत्याही स्वरूपात पाठवा — PDF, Excel किंवा फोटो — आमची टीम तो सेट करते आणि तुमच्या स्टाफला मूलभूत गोष्टी शिकवते.",
    "Can I keep my current POS or billing software?": "माझं सध्याचं POS किंवा बिलिंग सॉफ्टवेअर ठेवू शकतो का?",
    "In most cases yes — PlatesOS can run alongside your billing system while orders flow in digitally. Tell us what you use and we'll confirm before you commit.": "बहुतेक वेळा हो — PlatesOS तुमच्या बिलिंग सिस्टमसोबत चालू शकतं आणि ऑर्डर डिजिटल पद्धतीने येत राहतात. तुम्ही काय वापरता ते सांगा, आम्ही आधी खात्री करून देतो.",
    // faq — products
    "What QR table products do you supply?": "तुम्ही कोणती QR टेबल प्रॉडक्ट्स पुरवता?",
    "Table tents, tissue-box holders and condiment-caddy wraps, each printed with your branding and a QR code mapped to a specific table.": "टेबल टेंट, टिश्यू-बॉक्स होल्डर आणि कॉन्डिमेंट-कॅडी रॅप — प्रत्येकावर तुमची ब्रँडिंग आणि त्या टेबलचा QR कोड छापलेला असतो.",
    "Is the printing customised to my brand?": "प्रिंटिंग माझ्या ब्रँडनुसार होते का?",
    "Yes. Your logo, colours and a short call-to-action go on every piece, and you approve a digital proof before anything goes to print.": "हो. प्रत्येक वस्तूवर तुमचा लोगो, रंग आणि छोटा कॉल-टू-अ‍ॅक्शन येतो, आणि छपाईपूर्वी तुम्ही डिजिटल प्रूफ मंजूर करता.",
    "How do I order QR table products?": "QR टेबल प्रॉडक्ट्स कशी ऑर्डर करायची?",
    "Pick a product in the Products section above, tell us your table count, and we'll send a quote with pricing and delivery timelines.": "वरील प्रॉडक्ट्स विभागात प्रॉडक्ट निवडा, तुमच्या टेबलची संख्या सांगा, आणि आम्ही किंमत व डिलिव्हरी वेळेसह कोटेशन पाठवतो.",
    // faq — support
    "How do I reach your support team?": "सपोर्ट टीमशी संपर्क कसा साधायचा?",
    "Email {email} and we respond within 24 hours, or call {phone} between Mon – Fri, 9:00 AM – 6:00 PM. WhatsApp works too.": "{email} वर ईमेल करा — आम्ही 24 तासांत उत्तर देतो — किंवा सोम – शुक्र, सकाळी 9:00 ते संध्याकाळी 6:00 दरम्यान {phone} वर कॉल करा. WhatsApp देखील चालेल.",
    "Where are you based?": "तुम्ही कुठून काम करता?",
    "We're based in {location}, and remote support is available across the country — so your location is never a problem.": "आम्ही {location} येथून काम करतो, आणि देशभर रिमोट सपोर्ट उपलब्ध आहे — त्यामुळे तुमचं ठिकाण कधीच अडचण ठरत नाही.",
    "Is my restaurant's data safe?": "माझ्या रेस्टॉरंटचा डेटा सुरक्षित आहे का?",
    "Your data stays yours. It is stored on encrypted servers, access is limited by staff role, and you can export or request deletion of your data at any time.": "तुमचा डेटा तुमचाच राहतो. तो एन्क्रिप्टेड सर्व्हरवर साठवला जातो, अ‍ॅक्सेस स्टाफ भूमिकेनुसार मर्यादित असतो, आणि तुम्ही कधीही डेटा एक्सपोर्ट किंवा डिलीट करून घेऊ शकता.",
    // faq — ask box
    // faq — more answers
    "Do my customers need to download an app?": "ग्राहकांना अ‍ॅप डाउनलोड करावं लागतं का?",
    "No. Guests scan the QR code and your menu opens in their phone's browser — there is nothing to download, install or sign up for.": "नाही. पाहुणे QR कोड स्कॅन करतात आणि मेन्यू त्यांच्या फोनच्या ब्राउझरमध्ये उघडतो — काहीही डाउनलोड, इन्स्टॉल किंवा साइन-अप करावं लागत नाही.",
    "Which payment modes are supported?": "कोणते पेमेंट मोड चालतात?",
    "UPI, credit and debit cards, popular wallets, and cash at the counter — and every payment is tagged by mode in your reports.": "UPI, क्रेडिट व डेबिट कार्ड, लोकप्रिय वॉलेट, आणि काउंटरवर रोख — आणि प्रत्येक पेमेंट अहवालात त्याच्या मोडसह नोंदलं जातं.",
    "Can I take table bookings and reservations online?": "मी ऑनलाइन टेबल बुकिंग घेऊ शकतो का?",
    "Yes. Guests can request a table from your page, and you confirm, move or cancel bookings on a live floor plan that shows which tables are free.": "हो. पाहुणे तुमच्या पेजवरून टेबलची विनंती करू शकतात, आणि तुम्ही लाइव्ह फ्लोर प्लॅनवर बुकिंग मंजूर, बदल किंवा रद्द करू शकता — त्यात रिकामी टेबल दिसतात.",
    "Can I see live table status and a floor plan?": "लाइव्ह टेबल स्टेटस आणि फ्लोर प्लॅन दिसतो का?",
    "Yes. The floor plan shows which tables are occupied, which have ordered and which are waiting to pay, updating as orders come in.": "हो. फ्लोर प्लॅनवर कोणतं टेबल भरलं आहे, कोणी ऑर्डर दिली आहे आणि कोण पेमेंटच्या प्रतीक्षेत आहे ते दिसतं — ऑर्डर आल्यावर ते अपडेट होत राहतं.",
    "Does PlatesOS handle delivery and takeaway orders?": "PlatesOS डिलिव्हरी आणि टेकअवे ऑर्डर हाताळतं का?",
    "Yes. Your online ordering page accepts delivery and takeaway orders directly, with no commission taken on any of them.": "हो. तुमचं ऑनलाइन ऑर्डरिंग पेज डिलिव्हरी व टेकअवे ऑर्डर थेट स्वीकारतं, आणि त्यावर कोणतंही कमिशन लागत नाही.",
    "Does it print KOT tickets for the kitchen?": "किचनसाठी KOT प्रिंट होते का?",
    "Yes. Connect any standard thermal printer and each order prints as a KOT — or skip paper entirely and use the kitchen display screen instead.": "हो. कोणताही सामान्य थर्मल प्रिंटर जोडा आणि प्रत्येक ऑर्डर KOT म्हणून प्रिंट होईल — किंवा कागद टाळून किचन डिस्प्ले स्क्रीन वापरा.",
    "Can I run offers, coupons and discounts?": "मी ऑफर, कूपन आणि सूट देऊ शकतो का?",
    "Yes. Create percentage or flat-value coupons, happy-hour offers and item-level discounts, and switch them on or off whenever you like.": "हो. टक्केवारी किंवा ठरलेल्या रकमेचे कूपन, हॅपी-अवर ऑफर आणि आयटमनिहाय सूट तयार करा, आणि कधीही सुरू किंवा बंद करा.",
    "Can I manage staff accounts and permissions?": "मी स्टाफ अकाउंट आणि परवानग्या व्यवस्थापित करू शकतो का?",
    "Yes. Add managers, cashiers and kitchen staff with role-based access, so each person only sees the screens they need.": "हो. मॅनेजर, कॅशियर आणि किचन स्टाफला भूमिकेनुसार अ‍ॅक्सेस देऊन जोडा, जेणेकरून प्रत्येकाला फक्त आवश्यक स्क्रीन दिसतील.",
    "Can I track daily sales and best-selling items?": "दैनिक विक्री आणि सर्वाधिक विकले जाणारे आयटम पाहता येतात का?",
    "Yes. The dashboard shows today's sales, order count and average bill value, along with your best-selling and slowest-moving items.": "हो. डॅशबोर्डवर आजची विक्री, ऑर्डर संख्या आणि सरासरी बिल रक्कम, तसंच सर्वाधिक व सर्वात कमी विकले जाणारे आयटम दिसतात.",
    "Can I show my menu in more than one language?": "मेन्यू एकापेक्षा जास्त भाषांमध्ये दाखवता येतो का?",
    "Yes. Item names and descriptions can be entered in the language your guests read, and this site itself is available in English, Hindi, Marathi and Kannada.": "हो. आयटमची नावं व वर्णनं तुमचे पाहुणे वाचतील त्या भाषेत टाकता येतात, आणि ही साइट स्वतः इंग्रजी, हिंदी, मराठी व कन्नडमध्ये उपलब्ध आहे.",
    "What happens if my internet goes down?": "इंटरनेट बंद पडलं तर काय होतं?",
    "PlatesOS is cloud-based, so it needs a connection. Guests order over their own mobile data, so table ordering keeps working even when your Wi-Fi drops — keep a backup hotspot for billing.": "PlatesOS क्लाउड-आधारित आहे, त्यामुळे कनेक्शन आवश्यक आहे. पाहुणे त्यांच्या मोबाइल डेटावरून ऑर्डर करतात, म्हणून तुमचं Wi-Fi बंद पडलं तरी टेबल ऑर्डरिंग चालू राहते — बिलिंगसाठी बॅकअप हॉटस्पॉट ठेवा.",
    "How much does PlatesOS cost?": "PlatesOS ची किंमत किती आहे?",
    "Starter is ₹999 a month and Growth is ₹2,499 a month, both billed flat with no commission. Enterprise is priced to your chain — talk to sales for a quote.": "स्टार्टर ₹999 दरमहा आणि ग्रोथ ₹2,499 दरमहा — दोन्ही ठरलेली फी, कमिशन नाही. एंटरप्राइझची किंमत तुमच्या चेननुसार ठरते — कोटेशनसाठी सेल्सशी बोला.",
    "Are there any setup or hidden fees?": "सेटअप किंवा छुपे शुल्क आहेत का?",
    "No setup fee and no hidden charges — your plan price is what you pay. Printed QR table products are the only separate, optional cost.": "सेटअप फी नाही आणि छुपे शुल्क नाहीत — प्लॅनची किंमत तेवढीच तुम्ही भरता. फक्त छापील QR टेबल प्रॉडक्ट्स हा वेगळा व ऐच्छिक खर्च आहे.",
    "How can I pay for my subscription?": "सबस्क्रिप्शनचं पेमेंट कसं करायचं?",
    "UPI, credit or debit card, net banking and bank transfer are all accepted, and you get a GST invoice for every payment.": "UPI, क्रेडिट किंवा डेबिट कार्ड, नेट बँकिंग आणि बँक ट्रान्सफर — सर्व स्वीकारलं जातं, आणि प्रत्येक पेमेंटवर GST इनव्हॉइस मिळते.",
    "What is your refund and cancellation policy?": "तुमचं रिफंड आणि रद्द करण्याचं धोरण काय आहे?",
    "The {days}-day trial means you only pay once you're sure. After that you can cancel any time and you won't be billed from the next cycle — write to support for anything specific to your account.": "{days} दिवसांच्या ट्रायलमुळे तुम्ही खात्री झाल्यावरच पैसे भरता. त्यानंतर कधीही रद्द करा आणि पुढच्या सायकलपासून बिलिंग होणार नाही — तुमच्या अकाउंटशी संबंधित विशेष बाबीसाठी सपोर्टला लिहा.",
    "Is there a discount for annual billing or multiple outlets?": "वार्षिक बिलिंग किंवा अनेक आउटलेटसाठी सूट मिळते का?",
    "Yes — annual plans and multi-outlet accounts are priced lower per outlet. Tell us your outlet count and we'll share a quote.": "हो — वार्षिक प्लॅन आणि अनेक आउटलेट असलेल्या अकाउंटसाठी प्रति आउटलेट किंमत कमी असते. तुमच्या आउटलेटची संख्या सांगा, आम्ही कोटेशन पाठवतो.",
    "Can I try PlatesOS before paying?": "पैसे भरण्यापूर्वी PlatesOS वापरून पाहता येईल का?",
    "Yes. Start a {days}-day free trial with no card details, set up your real menu, and decide at the end of it.": "हो. कार्ड तपशिलाशिवाय {days} दिवसांची मोफत ट्रायल सुरू करा, तुमचा खरा मेन्यू सेट करा, आणि शेवटी ठरवा.",
    "Can I book a demo with your team?": "तुमच्या टीमसोबत डेमो बुक करू शकतो का?",
    "Yes. Pick “Book a demo” in the contact form or message us on WhatsApp, and we'll walk you through the product on a call at a time that suits you.": "हो. कॉन्टॅक्ट फॉर्ममध्ये “डेमो बुक करा” निवडा किंवा WhatsApp वर मेसेज करा — तुमच्या सोयीच्या वेळी कॉलवर आम्ही संपूर्ण प्रॉडक्ट दाखवतो.",
    "Do you train my staff on the system?": "तुम्ही माझ्या स्टाफला प्रशिक्षण देता का?",
    "Yes. We run a short walkthrough for your managers and kitchen staff, and leave you with simple guides they can refer back to.": "हो. तुमच्या मॅनेजर व किचन स्टाफसाठी आम्ही छोटा वॉकथ्रू घेतो, आणि नंतर पाहण्यासाठी सोपी मार्गदर्शक पुस्तिका देतो.",
    "How do I get my table QR codes printed?": "टेबल QR कोड कसे छापून घ्यायचे?",
    "Download print-ready QR PDFs from your dashboard and use any local printer, or order our printed table tents, tissue boxes and condiment caddies.": "डॅशबोर्डवरून प्रिंट-रेडी QR PDF डाउनलोड करा आणि कोणत्याही स्थानिक प्रिंटरकडून छापा, किंवा आमचे छापील टेबल टेंट, टिश्यू बॉक्स व कॉन्डिमेंट कॅडी मागवा.",
    "How quickly do you reply to support requests?": "सपोर्ट विनंतीला किती लवकर उत्तर मिळतं?",
    "Email gets a reply within 24 hours, and WhatsApp or phone is usually answered within the same working hour, Mon – Fri, 9:00 AM – 6:00 PM.": "ईमेलला 24 तासांत उत्तर मिळतं, आणि WhatsApp किंवा फोनवर सोम – शुक्र, सकाळी 9:00 ते संध्याकाळी 6:00 दरम्यान सामान्यतः त्याच तासात उत्तर मिळतं.",
    "Which languages is PlatesOS available in?": "PlatesOS कोणत्या भाषांमध्ये उपलब्ध आहे?",
    "The platform and this site are available in English, Hindi, Marathi and Kannada, and support is available in all four.": "प्लॅटफॉर्म आणि ही साइट इंग्रजी, हिंदी, मराठी व कन्नडमध्ये उपलब्ध आहेत, आणि सपोर्टही चारही भाषांमध्ये मिळतो.",
    // agent bot copy
    "💬 Ask a question": "💬 प्रश्न विचारा",
    "Chat with our team": "आमच्या टीमशी चॅट करा",
    "Pick a topic, or tap a popular question.": "विषय निवडा, किंवा लोकप्रिय प्रश्नावर टॅप करा.",
    "Popular": "लोकप्रिय",
    "Browse by topic": "विषयानुसार पाहा",
    "Other topics": "इतर विषय",
    "Setup": "सेटअप",
  },
  kn: {
    // nav
    "Home": "ಮುಖಪುಟ", "Features": "ವೈಶಿಷ್ಟ್ಯಗಳು", "Products": "ಉತ್ಪನ್ನಗಳು", "Pricing": "ಬೆಲೆ",
    "About": "ನಮ್ಮ ಬಗ್ಗೆ", "Contact": "ಸಂಪರ್ಕ", "Sign in": "ಸೈನ್ ಇನ್", "Get started": "ಪ್ರಾರಂಭಿಸಿ",
    // hero
    "Modern Restaurant Management Platform": "ಆಧುನಿಕ ರೆಸ್ಟೋರೆಂಟ್ ಮ್ಯಾನೇಜ್‌ಮೆಂಟ್ ಪ್ಲಾಟ್‌ಫಾರ್ಮ್",
    "Run Your Restaurant.": "ನಿಮ್ಮ ರೆಸ್ಟೋರೆಂಟ್ ನಡೆಸಿ.", "Smarter.": "ಇನ್ನಷ್ಟು ಸ್ಮಾರ್ಟ್ ಆಗಿ.",
    "One powerful platform to manage orders, tables, bookings, QR ordering, and daily operations — all in one place.":
      "ಆರ್ಡರ್, ಟೇಬಲ್, ಬುಕಿಂಗ್, QR ಆರ್ಡರಿಂಗ್ ಮತ್ತು ದೈನಂದಿನ ಕಾರ್ಯಾಚರಣೆ — ಎಲ್ಲವೂ ಒಂದೇ ಶಕ್ತಿಶಾಲಿ ಪ್ಲಾಟ್‌ಫಾರ್ಮ್‌ನಲ್ಲಿ.",
    "Start free trial": "ಉಚಿತ ಟ್ರಯಲ್ ಆರಂಭಿಸಿ", "Watch video": "ವಿಡಿಯೋ ನೋಡಿ",
    "No commission": "ಕಮಿಷನ್ ಇಲ್ಲ", "{days}-day free trial": "{days} ದಿನಗಳ ಉಚಿತ ಟ್ರಯಲ್", "Easy setup": "ಸುಲಭ ಸೆಟಪ್",
    // carousel
    "Dashboard": "ಡ್ಯಾಶ್‌ಬೋರ್ಡ್", "QR Table Ordering": "QR ಟೇಬಲ್ ಆರ್ಡರಿಂಗ್", "Online Ordering": "ಆನ್‌ಲೈನ್ ಆರ್ಡರಿಂಗ್",
    "Kitchen Operations": "ಕಿಚನ್ ಕಾರ್ಯಾಚರಣೆ", "Analytics": "ಅನಾಲಿಟಿಕ್ಸ್",
    // features
    "Everything you need": "ನಿಮಗೆ ಬೇಕಾದ ಎಲ್ಲವೂ",
    "Powerful features for": "ನಿಮ್ಮ ರೆಸ್ಟೋರೆಂಟ್‌ಗೆ", "your restaurant": "ಶಕ್ತಿಶಾಲಿ ವೈಶಿಷ್ಟ್ಯಗಳು",
    "From online orders to detailed reports, PlatesOS gives you the tools to run your restaurant smoothly and efficiently.":
      "ಆನ್‌ಲೈನ್ ಆರ್ಡರ್‌ಗಳಿಂದ ವಿವರವಾದ ವರದಿಗಳವರೆಗೆ, ರೆಸ್ಟೋರೆಂಟ್ ಸರಾಗವಾಗಿ ನಡೆಸಲು ಬೇಕಾದ ಎಲ್ಲ ಸಾಧನಗಳನ್ನು PlatesOS ನೀಡುತ್ತದೆ.",
    "Let customers order from anywhere.": "ಗ್ರಾಹಕರು ಎಲ್ಲಿಂದಲಾದರೂ ಆರ್ಡರ್ ಮಾಡಬಹುದು.",
    "Delivery & takeaway": "ಡೆಲಿವರಿ ಮತ್ತು ಟೇಕ್‌ಅವೇ",
    "Unique QR codes for every table.": "ಪ್ರತಿ ಟೇಬಲ್‌ಗೆ ಪ್ರತ್ಯೇಕ QR ಕೋಡ್.", "Scan · Order · Pay": "ಸ್ಕ್ಯಾನ್ · ಆರ್ಡರ್ · ಪಾವತಿ",
    "Table & Booking Management": "ಟೇಬಲ್ ಮತ್ತು ಬುಕಿಂಗ್ ನಿರ್ವಹಣೆ",
    "Manage reservations and table allocation.": "ರಿಸರ್ವೇಶನ್ ಮತ್ತು ಟೇಬಲ್ ಹಂಚಿಕೆ ನಿರ್ವಹಿಸಿ.", "Live floor plan": "ಲೈವ್ ಫ್ಲೋರ್ ಪ್ಲಾನ್",
    "Restaurant Dashboard": "ರೆಸ್ಟೋರೆಂಟ್ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್",
    "Track orders, sales, and performance in real-time.": "ಆರ್ಡರ್, ಮಾರಾಟ ಮತ್ತು ಕಾರ್ಯಕ್ಷಮತೆಯನ್ನು ರಿಯಲ್-ಟೈಮ್‌ನಲ್ಲಿ ನೋಡಿ.", "Real-time": "ರಿಯಲ್-ಟೈಮ್",
    "Orders, Reports & Invoices": "ಆರ್ಡರ್, ವರದಿ ಮತ್ತು ಇನ್‌ವಾಯ್ಸ್",
    "Stay organized with detailed reports.": "ವಿವರವಾದ ವರದಿಗಳೊಂದಿಗೆ ಎಲ್ಲವೂ ವ್ಯವಸ್ಥಿತ.", "GST-ready invoices": "GST-ರೆಡಿ ಇನ್‌ವಾಯ್ಸ್",
    "No Commission": "ಕಮಿಷನ್ ಇಲ್ಲ", "Keep 100% of your earnings.": "ನಿಮ್ಮ ಸಂಪೂರ್ಣ ಗಳಿಕೆ ನಿಮ್ಮದೇ.", "0% per order": "ಪ್ರತಿ ಆರ್ಡರ್‌ಗೆ 0%",
    // products
    "On every table": "ಪ್ರತಿ ಟೇಬಲ್ ಮೇಲೆ",
    "Premium QR products for": "ನಿಮ್ಮ ಟೇಬಲ್‌ಗಳಿಗೆ", "your tables": "ಪ್ರೀಮಿಯಂ QR ಉತ್ಪನ್ನಗಳು",
    "Printed once, branded to your restaurant, and built to survive daily service. Every product links straight to your PlatesOS menu.":
      "ಒಮ್ಮೆ ಮುದ್ರಣ, ನಿಮ್ಮ ರೆಸ್ಟೋರೆಂಟ್‌ನ ಬ್ರಾಂಡಿಂಗ್ ಮತ್ತು ದೈನಂದಿನ ಬಳಕೆಗೆ ಬಾಳಿಕೆ. ಪ್ರತಿ ಉತ್ಪನ್ನವೂ ನೇರವಾಗಿ ನಿಮ್ಮ PlatesOS ಮೆನುಗೆ ಜೋಡಣೆಯಾಗುತ್ತದೆ.",
    "Condiment Holder QR": "ಕಂಡಿಮೆಂಟ್ ಹೋಲ್ಡರ್ QR", "Best seller": "ಅತಿ ಹೆಚ್ಚು ಮಾರಾಟ",
    "One caddy for spoons, forks, salt, pepper and napkins — with your ordering QR printed on the front face.":
      "ಚಮಚ, ಫೋರ್ಕ್, ಉಪ್ಪು, ಮೆಣಸು ಮತ್ತು ನ್ಯಾಪ್‌ಕಿನ್‌ಗಳಿಗೆ ಒಂದೇ ಸ್ಟ್ಯಾಂಡ್ — ಮುಂಭಾಗದಲ್ಲಿ ನಿಮ್ಮ ಆರ್ಡರಿಂಗ್ QR ಮುದ್ರಿತ.",
    "L-Shaped Table Tent QR": "L-ಆಕಾರದ ಟೇಬಲ್ ಟೆಂಟ್ QR", "Table numbering": "ಟೇಬಲ್ ಸಂಖ್ಯೆ",
    "Slim L-stand printed with your table number on both faces, so guests and servers always know the table.":
      "ತೆಳುವಾದ L-ಸ್ಟ್ಯಾಂಡ್, ಎರಡೂ ಬದಿಗಳಲ್ಲಿ ಟೇಬಲ್ ಸಂಖ್ಯೆ ಮುದ್ರಿತ — ಗ್ರಾಹಕರಿಗೂ ಸಿಬ್ಬಂದಿಗೂ ಟೇಬಲ್ ತಕ್ಷಣ ತಿಳಿಯುತ್ತದೆ.",
    "Tissue Box QR Branding": "ಟಿಶ್ಯೂ ಬಾಕ್ಸ್ QR ಬ್ರಾಂಡಿಂಗ್", "Everyday branding": "ದೈನಂದಿನ ಬ್ರಾಂಡಿಂಗ್",
    "Custom-printed tissue boxes carrying your logo and ordering QR — useful on the table, seen at every meal.":
      "ನಿಮ್ಮ ಲೋಗೋ ಮತ್ತು ಆರ್ಡರಿಂಗ್ QR ಇರುವ ಕಸ್ಟಮ್-ಪ್ರಿಂಟೆಡ್ ಟಿಶ್ಯೂ ಬಾಕ್ಸ್ — ಟೇಬಲ್ ಮೇಲೆ ಉಪಯುಕ್ತ, ಪ್ರತಿ ಊಟದಲ್ಲೂ ಕಣ್ಣಿಗೆ ಬೀಳುತ್ತದೆ.",
    "Get This for My Restaurant": "ನನ್ನ ರೆಸ್ಟೋರೆಂಟ್‌ಗೆ ಬೇಕು",
    "Front": "ಮುಂಭಾಗ", "Back": "ಹಿಂಭಾಗ", "Left": "ಎಡ", "Right": "ಬಲ",
    "Product images are indicative mockups — hover or tap the arrows to see all four sides. Custom sizes, colours and branding available on request.":
      "ಉತ್ಪನ್ನದ ಚಿತ್ರಗಳು ಸಾಂಕೇತಿಕ ಮಾಕಪ್‌ಗಳು — ನಾಲ್ಕೂ ಬದಿಗಳನ್ನು ನೋಡಲು ಬಾಣಗಳ ಮೇಲೆ ಟ್ಯಾಪ್ ಮಾಡಿ. ಕಸ್ಟಮ್ ಗಾತ್ರ, ಬಣ್ಣ ಮತ್ತು ಬ್ರಾಂಡಿಂಗ್ ಕೋರಿಕೆಯ ಮೇರೆಗೆ ಲಭ್ಯ.",
    // why
    "Why choose PlatesOS": "PlatesOS ಏಕೆ",
    "Built for modern": "ಆಧುನಿಕ ರೆಸ್ಟೋರೆಂಟ್‌ಗಳಿಗಾಗಿ", "restaurants": "ನಿರ್ಮಿಸಲಾಗಿದೆ",
    "Simple to use, powerful behind the scenes, and designed to help you serve better, manage easier, and grow faster.":
      "ಬಳಸಲು ಸುಲಭ, ಒಳಗಿನಿಂದ ಶಕ್ತಿಶಾಲಿ — ಉತ್ತಮ ಸೇವೆ, ಸುಲಭ ನಿರ್ವಹಣೆ ಮತ್ತು ವೇಗದ ಬೆಳವಣಿಗೆಗಾಗಿ.",
    "Easy setup & onboarding": "ಸುಲಭ ಸೆಟಪ್ ಮತ್ತು ಆನ್‌ಬೋರ್ಡಿಂಗ್", "Dedicated support": "ಸಮರ್ಪಿತ ಬೆಂಬಲ",
    "Scalable for single or multi-branch restaurants": "ಒಂದು ಅಥವಾ ಹಲವು ಶಾಖೆಗಳ ರೆಸ್ಟೋರೆಂಟ್‌ಗಳಿಗೆ ಸೂಕ್ತ",
    "Trusted by modern food businesses": "ಆಧುನಿಕ ಫುಡ್ ಬಿಸಿನೆಸ್‌ಗಳ ವಿಶ್ವಾಸ",
    "New Order": "ಹೊಸ ಆರ್ಡರ್", "New Booking": "ಹೊಸ ಬುಕಿಂಗ್", "Daily Report Ready": "ದೈನಂದಿನ ವರದಿ ಸಿದ್ಧ",
    // pricing
    "Simple pricing": "ಸರಳ ಬೆಲೆ", "Plans that grow": "ನಿಮ್ಮೊಂದಿಗೆ ಬೆಳೆಯುವ", "with you": "ಪ್ಲಾನ್‌ಗಳು",
    "No commission on orders. {days}-day free trial on every plan.": "ಆರ್ಡರ್‌ಗಳ ಮೇಲೆ ಕಮಿಷನ್ ಇಲ್ಲ. ಪ್ರತಿ ಪ್ಲಾನ್‌ಗೂ {days} ದಿನಗಳ ಉಚಿತ ಟ್ರಯಲ್.",
    "Starter": "ಸ್ಟಾರ್ಟರ್", "For single-outlet cafés": "ಒಂದೇ ಔಟ್‌ಲೆಟ್ ಕೆಫೆಗಳಿಗೆ",
    "QR table ordering": "QR ಟೇಬಲ್ ಆರ್ಡರಿಂಗ್", "Online menu": "ಆನ್‌ಲೈನ್ ಮೆನು", "Basic reports": "ಮೂಲ ವರದಿಗಳು", "Email support": "ಇಮೇಲ್ ಬೆಂಬಲ",
    "Growth": "ಗ್ರೋತ್", "For busy restaurants": "ಬ್ಯುಸಿ ರೆಸ್ಟೋರೆಂಟ್‌ಗಳಿಗೆ", "Everything in Starter": "ಸ್ಟಾರ್ಟರ್‌ನ ಎಲ್ಲವೂ",
    "Online ordering website": "ಆನ್‌ಲೈನ್ ಆರ್ಡರಿಂಗ್ ವೆಬ್‌ಸೈಟ್", "Kitchen display": "ಕಿಚನ್ ಡಿಸ್‌ಪ್ಲೇ",
    "Enterprise": "ಎಂಟರ್‌ಪ್ರೈಸ್", "For chains & multi-branch": "ಚೈನ್ ಮತ್ತು ಹಲವು ಶಾಖೆಗಳಿಗೆ", "Everything in Growth": "ಗ್ರೋತ್‌ನ ಎಲ್ಲವೂ",
    "Multi-branch control": "ಮಲ್ಟಿ-ಬ್ರಾಂಚ್ ನಿಯಂತ್ರಣ", "Advanced analytics": "ಸುಧಾರಿತ ಅನಾಲಿಟಿಕ್ಸ್", "Dedicated manager": "ಸಮರ್ಪಿತ ಮ್ಯಾನೇಜರ್",
    "Most popular": "ಅತಿ ಜನಪ್ರಿಯ", "/month": "/ತಿಂಗಳು", "Talk to sales": "ಸೇಲ್ಸ್‌ನೊಂದಿಗೆ ಮಾತನಾಡಿ", "Custom": "ಕಸ್ಟಮ್",
    // contact
    "Get in touch": "ಸಂಪರ್ಕಿಸಿ", "Us": "ಮಾಡಿ",
    "We'd love to hear from you! Whether you have a question, need support, or want to partner with us — we're here to help.":
      "ನಿಮ್ಮಿಂದ ಕೇಳಲು ನಮಗೆ ಸಂತೋಷ! ಪ್ರಶ್ನೆ ಇರಲಿ, ಬೆಂಬಲ ಬೇಕಿರಲಿ ಅಥವಾ ಪಾಲುದಾರಿಕೆ ಇರಲಿ — ನಾವು ಸಹಾಯಕ್ಕೆ ಸಿದ್ಧ.",
    "Email": "ಇಮೇಲ್", "We'll respond within 24 hours.": "ನಾವು 24 ಗಂಟೆಗಳಲ್ಲಿ ಉತ್ತರಿಸುತ್ತೇವೆ.",
    "Phone": "ಫೋನ್", "Mon – Fri, 9:00 AM – 6:00 PM": "ಸೋಮ – ಶುಕ್ರ, ಬೆಳಿಗ್ಗೆ 9:00 – ಸಂಜೆ 6:00",
    "Location": "ವಿಳಾಸ", "(Remote support available)": "(ರಿಮೋಟ್ ಬೆಂಬಲ ಲಭ್ಯ)",
    "Send us a message": "ನಮಗೆ ಸಂದೇಶ ಕಳುಹಿಸಿ", "Full name": "ಪೂರ್ಣ ಹೆಸರು", "Your name": "ನಿಮ್ಮ ಹೆಸರು",
    "Restaurant name": "ರೆಸ್ಟೋರೆಂಟ್ ಹೆಸರು", "Subject": "ವಿಷಯ", "Select an option": "ಒಂದು ಆಯ್ಕೆ ಆರಿಸಿ",
    "Book a demo": "ಡೆಮೊ ಬುಕ್ ಮಾಡಿ", "Support": "ಬೆಂಬಲ", "Partnership": "ಪಾಲುದಾರಿಕೆ",
    "Message": "ಸಂದೇಶ", "How can we help you?": "ನಾವು ಹೇಗೆ ಸಹಾಯ ಮಾಡಬಹುದು?",
    "Send message": "ಸಂದೇಶ ಕಳುಹಿಸಿ", "Sending…": "ಕಳುಹಿಸಲಾಗುತ್ತಿದೆ…",
    "Name is required": "ಹೆಸರು ಅಗತ್ಯ", "Enter a valid email": "ಸರಿಯಾದ ಇಮೇಲ್ ನಮೂದಿಸಿ", "Enter a valid phone": "ಸರಿಯಾದ ಫೋನ್ ಸಂಖ್ಯೆ ನಮೂದಿಸಿ",
    "Choose a subject": "ವಿಷಯ ಆರಿಸಿ", "Message must be at least 10 characters": "ಸಂದೇಶ ಕನಿಷ್ಠ 10 ಅಕ್ಷರಗಳಿರಬೇಕು",
    "Message must be under 5000 characters": "ಸಂದೇಶ 5000 ಅಕ್ಷರಗಳಿಗಿಂತ ಕಡಿಮೆ ಇರಲಿ",
    "Couldn't send your message. Please try again.": "ನಿಮ್ಮ ಸಂದೇಶ ಕಳುಹಿಸಲಾಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    "Or email us at": "ಅಥವಾ ನಮಗೆ ಇಮೇಲ್ ಮಾಡಿ:",
    "Thanks! We'll respond within 24 hours.": "ಧನ್ಯವಾದ! ನಾವು 24 ಗಂಟೆಗಳಲ್ಲಿ ಉತ್ತರಿಸುತ್ತೇವೆ.",
    // final cta + footer
    "Ready to grow your restaurant?": "ನಿಮ್ಮ ರೆಸ್ಟೋರೆಂಟ್ ಬೆಳೆಸಲು ಸಿದ್ಧರೇ?",
    "Set up in minutes. No commission. Cancel anytime.": "ನಿಮಿಷಗಳಲ್ಲಿ ಸೆಟಪ್. ಕಮಿಷನ್ ಇಲ್ಲ. ಯಾವಾಗ ಬೇಕಾದರೂ ರದ್ದು.",
    "Privacy Policy": "ಗೌಪ್ಯತಾ ನೀತಿ", "Terms of Service": "ಸೇವಾ ನಿಯಮಗಳು", "All rights reserved.": "ಎಲ್ಲ ಹಕ್ಕುಗಳು ಕಾಯ್ದಿರಿಸಲಾಗಿವೆ.",
    // agent
    "PlatesOS Agent": "PlatesOS ಏಜೆಂಟ್", "Online · replies fast": "ಆನ್‌ಲೈನ್ · ಶೀಘ್ರ ಉತ್ತರ", "typing…": "ಟೈಪ್ ಮಾಡುತ್ತಿದ್ದಾರೆ…",
    "Hi! I'm the PlatesOS Agent 👋": "ನಮಸ್ಕಾರ! ನಾನು PlatesOS ಏಜೆಂಟ್ 👋",
    "Want to know more about our platform? Chat with us.": "ನಮ್ಮ ಪ್ಲಾಟ್‌ಫಾರ್ಮ್ ಬಗ್ಗೆ ಇನ್ನಷ್ಟು ತಿಳಿಯಬೇಕೇ? ನಮ್ಮೊಂದಿಗೆ ಚಾಟ್ ಮಾಡಿ.",
    "Want to know more about our platform?": "ನಮ್ಮ ಪ್ಲಾಟ್‌ಫಾರ್ಮ್ ಬಗ್ಗೆ ಇನ್ನಷ್ಟು ತಿಳಿಯಬೇಕೇ?",
    "Chat with us": "ನಮ್ಮೊಂದಿಗೆ ಚಾಟ್ ಮಾಡಿ", "💰 Pricing": "💰 ಬೆಲೆ", "📅 Book a demo": "📅 ಡೆಮೊ ಬುಕ್ ಮಾಡಿ", "📱 QR ordering": "📱 QR ಆರ್ಡರಿಂಗ್",
    "Language": "ಭಾಷೆ",
    // guided chat
    "What can I help you with today?": "ಇಂದು ನಾನು ಹೇಗೆ ಸಹಾಯ ಮಾಡಲಿ?",
    "💰 Pricing & plans": "💰 ಬೆಲೆ ಮತ್ತು ಪ್ಲಾನ್‌ಗಳು", "🪧 QR table products": "🪧 QR ಟೇಬಲ್ ಉತ್ಪನ್ನಗಳು", "🛠️ Support": "🛠️ ಬೆಂಬಲ",
    "How many outlets do you run?": "ನಿಮ್ಮ ಬಳಿ ಎಷ್ಟು ಔಟ್‌ಲೆಟ್‌ಗಳಿವೆ?",
    "1 outlet": "1 ಔಟ್‌ಲೆಟ್", "2–5 outlets": "2–5 ಔಟ್‌ಲೆಟ್", "6+ outlets": "6+ ಔಟ್‌ಲೆಟ್",
    "What type of business is it?": "ನಿಮ್ಮ ವ್ಯವಹಾರ ಯಾವ ರೀತಿಯದು?",
    "Café": "ಕೆಫೆ", "Restaurant": "ರೆಸ್ಟೋರೆಂಟ್", "Cloud kitchen": "ಕ್ಲೌಡ್ ಕಿಚನ್", "QSR / Fast food": "QSR / ಫಾಸ್ಟ್ ಫುಡ್",
    "Which feature matters most to you?": "ನಿಮಗೆ ಯಾವ ವೈಶಿಷ್ಟ್ಯ ಹೆಚ್ಚು ಮುಖ್ಯ?",
    "Online ordering": "ಆನ್‌ಲೈನ್ ಆರ್ಡರಿಂಗ್", "Table bookings": "ಟೇಬಲ್ ಬುಕಿಂಗ್", "Kitchen & reports": "ಕಿಚನ್ ಮತ್ತು ವರದಿಗಳು",
    "Which product are you interested in?": "ನಿಮಗೆ ಯಾವ ಉತ್ಪನ್ನ ಬೇಕು?", "Not sure yet": "ಇನ್ನೂ ನಿರ್ಧರಿಸಿಲ್ಲ",
    "Roughly how many tables do you have?": "ನಿಮ್ಮ ಬಳಿ ಸುಮಾರು ಎಷ್ಟು ಟೇಬಲ್‌ಗಳಿವೆ?", "Under 10": "10ಕ್ಕಿಂತ ಕಡಿಮೆ",
    "What is the issue about?": "ಸಮಸ್ಯೆ ಯಾವುದರ ಬಗ್ಗೆ?",
    "Login / account": "ಲಾಗಿನ್ / ಖಾತೆ", "Orders or payments": "ಆರ್ಡರ್ ಅಥವಾ ಪಾವತಿ",
    "QR or menu setup": "QR ಅಥವಾ ಮೆನು ಸೆಟಪ್", "Something else": "ಬೇರೆ ಏನೋ",
    "Thanks! Tap below to continue on WhatsApp — our team will reply shortly.":
      "ಧನ್ಯವಾದ! WhatsApp ನಲ್ಲಿ ಮುಂದುವರಿಯಲು ಕೆಳಗೆ ಟ್ಯಾಪ್ ಮಾಡಿ — ನಮ್ಮ ತಂಡ ಶೀಘ್ರದಲ್ಲಿ ಉತ್ತರಿಸುತ್ತದೆ.",
    "Continue on WhatsApp": "WhatsApp ನಲ್ಲಿ ಮುಂದುವರಿಸಿ", "Start over": "ಮತ್ತೆ ಆರಂಭಿಸಿ",
    // faq — features
    "What exactly does PlatesOS do?": "PlatesOS ನಿಜವಾಗಿ ಏನು ಮಾಡುತ್ತದೆ?",
    "PlatesOS runs your day-to-day restaurant operations in one place — QR table ordering, online ordering, table bookings, kitchen tickets, billing, reports and invoices.": "PlatesOS ನಿಮ್ಮ ರೆಸ್ಟೋರೆಂಟ್‌ನ ದೈನಂದಿನ ಕೆಲಸಗಳನ್ನು ಒಂದೇ ಕಡೆ ನಿರ್ವಹಿಸುತ್ತದೆ — QR ಟೇಬಲ್ ಆರ್ಡರಿಂಗ್, ಆನ್‌ಲೈನ್ ಆರ್ಡರಿಂಗ್, ಟೇಬಲ್ ಬುಕಿಂಗ್, ಕಿಚನ್ ಟಿಕೆಟ್, ಬಿಲ್ಲಿಂಗ್, ವರದಿ ಮತ್ತು ಇನ್‌ವಾಯ್ಸ್.",
    "How does QR table ordering work?": "QR ಟೇಬಲ್ ಆರ್ಡರಿಂಗ್ ಹೇಗೆ ಕೆಲಸ ಮಾಡುತ್ತದೆ?",
    "Every table gets its own QR code. Guests scan, browse your live menu, order and pay from their phone, and the order reaches your kitchen with the table number already attached.": "ಪ್ರತಿ ಟೇಬಲ್‌ಗೆ ತನ್ನದೇ QR ಕೋಡ್ ಇರುತ್ತದೆ. ಅತಿಥಿಗಳು ಸ್ಕ್ಯಾನ್ ಮಾಡಿ, ಲೈವ್ ಮೆನು ನೋಡಿ, ಫೋನ್‌ನಿಂದಲೇ ಆರ್ಡರ್ ಮತ್ತು ಪಾವತಿ ಮಾಡುತ್ತಾರೆ, ಮತ್ತು ಆರ್ಡರ್ ಟೇಬಲ್ ಸಂಖ್ಯೆಯೊಂದಿಗೆ ನೇರವಾಗಿ ಕಿಚನ್‌ಗೆ ತಲುಪುತ್ತದೆ.",
    "Can guests pay from their own phone?": "ಅತಿಥಿಗಳು ತಮ್ಮ ಫೋನ್‌ನಿಂದ ಪಾವತಿಸಬಹುದೇ?",
    "Yes. Guests can pay by UPI, card or wallet while ordering, or you can keep pay-at-counter on and collect at billing as usual.": "ಹೌದು. ಅತಿಥಿಗಳು ಆರ್ಡರ್ ಮಾಡುವಾಗಲೇ UPI, ಕಾರ್ಡ್ ಅಥವಾ ವಾಲೆಟ್‌ನಿಂದ ಪಾವತಿಸಬಹುದು, ಅಥವಾ pay-at-counter ಆನ್ ಇಟ್ಟು ಎಂದಿನಂತೆ ಬಿಲ್ಲಿಂಗ್‌ನಲ್ಲಿ ಹಣ ಪಡೆಯಬಹುದು.",
    "Can I update my menu and prices myself?": "ನಾನೇ ಮೆನು ಮತ್ತು ಬೆಲೆ ಅಪ್‌ಡೇಟ್ ಮಾಡಬಹುದೇ?",
    "Yes. Items, prices, photos, add-ons and out-of-stock toggles update instantly across every table QR code and your online ordering page.": "ಹೌದು. ಐಟಂ, ಬೆಲೆ, ಫೋಟೋ, ಆ್ಯಡ್-ಆನ್ ಮತ್ತು ಔಟ್-ಆಫ್-ಸ್ಟಾಕ್ ಟಾಗಲ್ ಪ್ರತಿ ಟೇಬಲ್ QR ಕೋಡ್ ಮತ್ತು ನಿಮ್ಮ ಆನ್‌ಲೈನ್ ಆರ್ಡರಿಂಗ್ ಪುಟದಲ್ಲಿ ತಕ್ಷಣ ಅಪ್‌ಡೇಟ್ ಆಗುತ್ತವೆ.",
    "Does it work for multiple outlets or branches?": "ಹಲವು ಔಟ್‌ಲೆಟ್ ಅಥವಾ ಶಾಖೆಗಳಿಗೆ ಇದು ಕೆಲಸ ಮಾಡುತ್ತದೆಯೇ?",
    "Yes. The Enterprise plan adds multi-branch control from a single login, with branch-level menus and pricing plus consolidated reporting across outlets.": "ಹೌದು. ಎಂಟರ್‌ಪ್ರೈಸ್ ಪ್ಲಾನ್‌ನಲ್ಲಿ ಒಂದೇ ಲಾಗಿನ್‌ನಿಂದ ಮಲ್ಟಿ-ಬ್ರಾಂಚ್ ನಿಯಂತ್ರಣ ಸಿಗುತ್ತದೆ — ಶಾಖೆವಾರು ಮೆನು ಮತ್ತು ಬೆಲೆಯೊಂದಿಗೆ ಎಲ್ಲ ಔಟ್‌ಲೆಟ್‌ಗಳ ಒಟ್ಟು ವರದಿ.",
    "Do I get GST-ready invoices and reports?": "GST-ರೆಡಿ ಇನ್‌ವಾಯ್ಸ್ ಮತ್ತು ವರದಿ ಸಿಗುತ್ತವೆಯೇ?",
    "Yes. Every order produces a GST-ready invoice, and daily, item-wise and payment-mode reports can be viewed or exported at any time.": "ಹೌದು. ಪ್ರತಿ ಆರ್ಡರ್‌ಗೂ GST-ರೆಡಿ ಇನ್‌ವಾಯ್ಸ್ ತಯಾರಾಗುತ್ತದೆ, ಮತ್ತು ದೈನಂದಿನ, ಐಟಂವಾರು ಹಾಗೂ ಪಾವತಿ-ಮೋಡ್ ವರದಿಗಳನ್ನು ಯಾವಾಗ ಬೇಕಾದರೂ ನೋಡಬಹುದು ಅಥವಾ ಎಕ್ಸ್‌ಪೋರ್ಟ್ ಮಾಡಬಹುದು.",
    "Do I need special hardware to use PlatesOS?": "PlatesOS ಬಳಸಲು ವಿಶೇಷ ಹಾರ್ಡ್‌ವೇರ್ ಬೇಕೇ?",
    "No. PlatesOS runs in any modern browser — on a phone, tablet, laptop or your existing billing computer. A thermal printer and a kitchen display screen are optional.": "ಇಲ್ಲ. PlatesOS ಯಾವುದೇ ಆಧುನಿಕ ಬ್ರೌಸರ್‌ನಲ್ಲಿ ಚಲಿಸುತ್ತದೆ — ಫೋನ್, ಟ್ಯಾಬ್ಲೆಟ್, ಲ್ಯಾಪ್‌ಟಾಪ್ ಅಥವಾ ನಿಮ್ಮ ಈಗಿನ ಬಿಲ್ಲಿಂಗ್ ಕಂಪ್ಯೂಟರ್‌ನಲ್ಲಿ. ಥರ್ಮಲ್ ಪ್ರಿಂಟರ್ ಮತ್ತು ಕಿಚನ್ ಡಿಸ್‌ಪ್ಲೇ ಸ್ಕ್ರೀನ್ ಐಚ್ಛಿಕ.",
    // faq — pricing
    "Do you charge commission on orders?": "ನೀವು ಆರ್ಡರ್‌ಗಳ ಮೇಲೆ ಕಮಿಷನ್ ತೆಗೆದುಕೊಳ್ಳುತ್ತೀರಾ?",
    "Never. You keep 100% of every order value and pay only a flat monthly plan fee, no matter how many orders you take.": "ಎಂದಿಗೂ ಇಲ್ಲ. ಪ್ರತಿ ಆರ್ಡರ್‌ನ ಪೂರ್ಣ ಮೊತ್ತ ನಿಮ್ಮದೇ — ನೀವು ಕೇವಲ ನಿಗದಿತ ಮಾಸಿಕ ಪ್ಲಾನ್ ಶುಲ್ಕ ಪಾವತಿಸುತ್ತೀರಿ, ಎಷ್ಟೇ ಆರ್ಡರ್ ಬಂದರೂ.",
    "Is there a free trial?": "ಉಚಿತ ಟ್ರಯಲ್ ಇದೆಯೇ?",
    "Yes — a {days}-day free trial on every plan. You can explore the full product first and cancel any time before the trial ends.": "ಹೌದು — ಪ್ರತಿ ಪ್ಲಾನ್‌ಗೂ {days} ದಿನಗಳ ಉಚಿತ ಟ್ರಯಲ್. ಮೊದಲು ಪೂರ್ಣ ಉತ್ಪನ್ನ ಬಳಸಿ ನೋಡಿ, ಟ್ರಯಲ್ ಮುಗಿಯುವ ಮೊದಲು ಯಾವಾಗ ಬೇಕಾದರೂ ರದ್ದು ಮಾಡಬಹುದು.",
    "Which plan should I start with?": "ನಾನು ಯಾವ ಪ್ಲಾನ್‌ನಿಂದ ಆರಂಭಿಸಬೇಕು?",
    "Starter fits a single-outlet café, Growth fits a busy restaurant that needs online ordering and a kitchen display, and Enterprise fits chains and multi-branch operations.": "ಸ್ಟಾರ್ಟರ್ ಒಂದೇ ಔಟ್‌ಲೆಟ್ ಕೆಫೆಗೆ, ಗ್ರೋತ್ ಆನ್‌ಲೈನ್ ಆರ್ಡರಿಂಗ್ ಮತ್ತು ಕಿಚನ್ ಡಿಸ್‌ಪ್ಲೇ ಬೇಕಾದ ಬ್ಯುಸಿ ರೆಸ್ಟೋರೆಂಟ್‌ಗೆ, ಮತ್ತು ಎಂಟರ್‌ಪ್ರೈಸ್ ಚೈನ್ ಹಾಗೂ ಹಲವು ಶಾಖೆಗಳಿಗೆ ಸೂಕ್ತ.",
    "Can I change or cancel my plan later?": "ನಂತರ ಪ್ಲಾನ್ ಬದಲಿಸಬಹುದೇ ಅಥವಾ ರದ್ದು ಮಾಡಬಹುದೇ?",
    "Yes. Upgrade, downgrade or cancel from your dashboard whenever you like — changes take effect from your next billing cycle.": "ಹೌದು. ಡ್ಯಾಶ್‌ಬೋರ್ಡ್‌ನಿಂದ ಯಾವಾಗ ಬೇಕಾದರೂ ಅಪ್‌ಗ್ರೇಡ್, ಡೌನ್‌ಗ್ರೇಡ್ ಅಥವಾ ರದ್ದು ಮಾಡಿ — ಬದಲಾವಣೆಗಳು ಮುಂದಿನ ಬಿಲ್ಲಿಂಗ್ ಸೈಕಲ್‌ನಿಂದ ಜಾರಿಗೆ ಬರುತ್ತವೆ.",
    // faq — setup
    "How long does setup take?": "ಸೆಟಪ್‌ಗೆ ಎಷ್ಟು ಸಮಯ ಬೇಕು?",
    "Most restaurants go live the same day. Once your menu is in, your table QR codes and ordering page are generated straight away.": "ಹೆಚ್ಚಿನ ರೆಸ್ಟೋರೆಂಟ್‌ಗಳು ಅದೇ ದಿನ ಲೈವ್ ಆಗುತ್ತವೆ. ಮೆನು ಸೇರಿಸಿದ ತಕ್ಷಣ ನಿಮ್ಮ ಟೇಬಲ್ QR ಕೋಡ್‌ಗಳು ಮತ್ತು ಆರ್ಡರಿಂಗ್ ಪುಟ ತಯಾರಾಗುತ್ತವೆ.",
    "Do you help with menu upload and onboarding?": "ಮೆನು ಅಪ್‌ಲೋಡ್ ಮತ್ತು ಆನ್‌ಬೋರ್ಡಿಂಗ್‌ನಲ್ಲಿ ನೀವು ಸಹಾಯ ಮಾಡುತ್ತೀರಾ?",
    "Yes. Share your existing menu in any format — PDF, Excel or even photos — and our team sets it up and walks your staff through the basics.": "ಹೌದು. ನಿಮ್ಮ ಈಗಿನ ಮೆನುವನ್ನು ಯಾವುದೇ ರೂಪದಲ್ಲಿ ಕಳುಹಿಸಿ — PDF, Excel ಅಥವಾ ಫೋಟೋ — ನಮ್ಮ ತಂಡ ಅದನ್ನು ಸೆಟ್ ಮಾಡಿ ನಿಮ್ಮ ಸಿಬ್ಬಂದಿಗೆ ಮೂಲ ವಿಷಯಗಳನ್ನು ಕಲಿಸುತ್ತದೆ.",
    "Can I keep my current POS or billing software?": "ನನ್ನ ಈಗಿನ POS ಅಥವಾ ಬಿಲ್ಲಿಂಗ್ ಸಾಫ್ಟ್‌ವೇರ್ ಉಳಿಸಿಕೊಳ್ಳಬಹುದೇ?",
    "In most cases yes — PlatesOS can run alongside your billing system while orders flow in digitally. Tell us what you use and we'll confirm before you commit.": "ಹೆಚ್ಚಿನ ಸಂದರ್ಭಗಳಲ್ಲಿ ಹೌದು — PlatesOS ನಿಮ್ಮ ಬಿಲ್ಲಿಂಗ್ ಸಿಸ್ಟಂ ಜೊತೆಜೊತೆಗೆ ಚಲಿಸಬಹುದು ಮತ್ತು ಆರ್ಡರ್‌ಗಳು ಡಿಜಿಟಲ್ ಆಗಿ ಬರುತ್ತಿರುತ್ತವೆ. ನೀವು ಏನು ಬಳಸುತ್ತೀರಿ ಎಂದು ತಿಳಿಸಿ, ನಾವು ಮೊದಲೇ ಖಚಿತಪಡಿಸುತ್ತೇವೆ.",
    // faq — products
    "What QR table products do you supply?": "ನೀವು ಯಾವ QR ಟೇಬಲ್ ಉತ್ಪನ್ನಗಳನ್ನು ಪೂರೈಸುತ್ತೀರಿ?",
    "Table tents, tissue-box holders and condiment-caddy wraps, each printed with your branding and a QR code mapped to a specific table.": "ಟೇಬಲ್ ಟೆಂಟ್, ಟಿಶ್ಯೂ-ಬಾಕ್ಸ್ ಹೋಲ್ಡರ್ ಮತ್ತು ಕಂಡಿಮೆಂಟ್-ಕ್ಯಾಡಿ ರ್ಯಾಪ್ — ಪ್ರತಿಯೊಂದರ ಮೇಲೂ ನಿಮ್ಮ ಬ್ರಾಂಡಿಂಗ್ ಮತ್ತು ಆ ಟೇಬಲ್‌ನ QR ಕೋಡ್ ಮುದ್ರಿತವಾಗಿರುತ್ತದೆ.",
    "Is the printing customised to my brand?": "ಮುದ್ರಣ ನನ್ನ ಬ್ರಾಂಡ್‌ಗೆ ತಕ್ಕಂತೆ ಇರುತ್ತದೆಯೇ?",
    "Yes. Your logo, colours and a short call-to-action go on every piece, and you approve a digital proof before anything goes to print.": "ಹೌದು. ಪ್ರತಿ ವಸ್ತುವಿನ ಮೇಲೆ ನಿಮ್ಮ ಲೋಗೋ, ಬಣ್ಣ ಮತ್ತು ಚಿಕ್ಕ ಕಾಲ್-ಟು-ಆ್ಯಕ್ಷನ್ ಇರುತ್ತದೆ, ಮತ್ತು ಮುದ್ರಣಕ್ಕೆ ಮೊದಲು ನೀವು ಡಿಜಿಟಲ್ ಪ್ರೂಫ್ ಅನುಮೋದಿಸುತ್ತೀರಿ.",
    "How do I order QR table products?": "QR ಟೇಬಲ್ ಉತ್ಪನ್ನಗಳನ್ನು ಹೇಗೆ ಆರ್ಡರ್ ಮಾಡುವುದು?",
    "Pick a product in the Products section above, tell us your table count, and we'll send a quote with pricing and delivery timelines.": "ಮೇಲಿನ ಉತ್ಪನ್ನಗಳ ವಿಭಾಗದಲ್ಲಿ ಉತ್ಪನ್ನ ಆರಿಸಿ, ನಿಮ್ಮ ಟೇಬಲ್‌ಗಳ ಸಂಖ್ಯೆ ತಿಳಿಸಿ, ನಾವು ಬೆಲೆ ಮತ್ತು ಡೆಲಿವರಿ ಸಮಯದೊಂದಿಗೆ ಕೊಟೇಶನ್ ಕಳುಹಿಸುತ್ತೇವೆ.",
    // faq — support
    "How do I reach your support team?": "ಬೆಂಬಲ ತಂಡವನ್ನು ಹೇಗೆ ಸಂಪರ್ಕಿಸುವುದು?",
    "Email {email} and we respond within 24 hours, or call {phone} between Mon – Fri, 9:00 AM – 6:00 PM. WhatsApp works too.": "{email} ಗೆ ಇಮೇಲ್ ಮಾಡಿ — ನಾವು 24 ಗಂಟೆಗಳಲ್ಲಿ ಉತ್ತರಿಸುತ್ತೇವೆ — ಅಥವಾ ಸೋಮ – ಶುಕ್ರ, ಬೆಳಿಗ್ಗೆ 9:00 ರಿಂದ ಸಂಜೆ 6:00 ರ ನಡುವೆ {phone} ಗೆ ಕರೆ ಮಾಡಿ. WhatsApp ಸಹ ಸಾಧ್ಯ.",
    "Where are you based?": "ನೀವು ಎಲ್ಲಿಂದ ಕೆಲಸ ಮಾಡುತ್ತೀರಿ?",
    "We're based in {location}, and remote support is available across the country — so your location is never a problem.": "ನಾವು {location} ನಿಂದ ಕೆಲಸ ಮಾಡುತ್ತೇವೆ, ಮತ್ತು ದೇಶಾದ್ಯಂತ ರಿಮೋಟ್ ಬೆಂಬಲ ಲಭ್ಯ — ಆದ್ದರಿಂದ ನಿಮ್ಮ ಸ್ಥಳ ಎಂದಿಗೂ ಸಮಸ್ಯೆಯಲ್ಲ.",
    "Is my restaurant's data safe?": "ನನ್ನ ರೆಸ್ಟೋರೆಂಟ್‌ನ ಡೇಟಾ ಸುರಕ್ಷಿತವೇ?",
    "Your data stays yours. It is stored on encrypted servers, access is limited by staff role, and you can export or request deletion of your data at any time.": "ನಿಮ್ಮ ಡೇಟಾ ನಿಮ್ಮದೇ. ಅದು ಎನ್‌ಕ್ರಿಪ್ಟೆಡ್ ಸರ್ವರ್‌ಗಳಲ್ಲಿ ಸಂಗ್ರಹವಾಗುತ್ತದೆ, ಪ್ರವೇಶ ಸಿಬ್ಬಂದಿಯ ಪಾತ್ರದ ಪ್ರಕಾರ ಸೀಮಿತವಾಗಿರುತ್ತದೆ, ಮತ್ತು ನೀವು ಯಾವಾಗ ಬೇಕಾದರೂ ಡೇಟಾ ಎಕ್ಸ್‌ಪೋರ್ಟ್ ಅಥವಾ ಅಳಿಸಲು ಕೋರಬಹುದು.",
    // faq — more answers
    "Do my customers need to download an app?": "ಗ್ರಾಹಕರು ಆ್ಯಪ್ ಡೌನ್‌ಲೋಡ್ ಮಾಡಬೇಕೇ?",
    "No. Guests scan the QR code and your menu opens in their phone's browser — there is nothing to download, install or sign up for.": "ಇಲ್ಲ. ಅತಿಥಿಗಳು QR ಕೋಡ್ ಸ್ಕ್ಯಾನ್ ಮಾಡಿದರೆ ಮೆನು ಅವರ ಫೋನ್‌ನ ಬ್ರೌಸರ್‌ನಲ್ಲಿ ತೆರೆಯುತ್ತದೆ — ಏನನ್ನೂ ಡೌನ್‌ಲೋಡ್, ಇನ್‌ಸ್ಟಾಲ್ ಅಥವಾ ಸೈನ್-ಅಪ್ ಮಾಡಬೇಕಿಲ್ಲ.",
    "Which payment modes are supported?": "ಯಾವ ಪಾವತಿ ವಿಧಾನಗಳು ಬೆಂಬಲಿತವಾಗಿವೆ?",
    "UPI, credit and debit cards, popular wallets, and cash at the counter — and every payment is tagged by mode in your reports.": "UPI, ಕ್ರೆಡಿಟ್ ಮತ್ತು ಡೆಬಿಟ್ ಕಾರ್ಡ್, ಜನಪ್ರಿಯ ವಾಲೆಟ್, ಮತ್ತು ಕೌಂಟರ್‌ನಲ್ಲಿ ನಗದು — ಪ್ರತಿ ಪಾವತಿಯೂ ವರದಿಯಲ್ಲಿ ಅದರ ಮೋಡ್‌ನೊಂದಿಗೆ ದಾಖಲಾಗುತ್ತದೆ.",
    "Can I take table bookings and reservations online?": "ಆನ್‌ಲೈನ್‌ನಲ್ಲಿ ಟೇಬಲ್ ಬುಕಿಂಗ್ ಪಡೆಯಬಹುದೇ?",
    "Yes. Guests can request a table from your page, and you confirm, move or cancel bookings on a live floor plan that shows which tables are free.": "ಹೌದು. ಅತಿಥಿಗಳು ನಿಮ್ಮ ಪುಟದಿಂದ ಟೇಬಲ್ ಕೋರಬಹುದು, ಮತ್ತು ಖಾಲಿ ಟೇಬಲ್‌ಗಳನ್ನು ತೋರಿಸುವ ಲೈವ್ ಫ್ಲೋರ್ ಪ್ಲಾನ್‌ನಲ್ಲಿ ನೀವು ಬುಕಿಂಗ್ ದೃಢಪಡಿಸಬಹುದು, ಬದಲಿಸಬಹುದು ಅಥವಾ ರದ್ದು ಮಾಡಬಹುದು.",
    "Can I see live table status and a floor plan?": "ಲೈವ್ ಟೇಬಲ್ ಸ್ಥಿತಿ ಮತ್ತು ಫ್ಲೋರ್ ಪ್ಲಾನ್ ಕಾಣಿಸುತ್ತದೆಯೇ?",
    "Yes. The floor plan shows which tables are occupied, which have ordered and which are waiting to pay, updating as orders come in.": "ಹೌದು. ಯಾವ ಟೇಬಲ್ ಭರ್ತಿಯಾಗಿದೆ, ಯಾರು ಆರ್ಡರ್ ಮಾಡಿದ್ದಾರೆ ಮತ್ತು ಯಾರು ಪಾವತಿಗೆ ಕಾಯುತ್ತಿದ್ದಾರೆ ಎಂಬುದನ್ನು ಫ್ಲೋರ್ ಪ್ಲಾನ್ ತೋರಿಸುತ್ತದೆ — ಆರ್ಡರ್ ಬಂದಂತೆ ಅದು ಅಪ್‌ಡೇಟ್ ಆಗುತ್ತದೆ.",
    "Does PlatesOS handle delivery and takeaway orders?": "PlatesOS ಡೆಲಿವರಿ ಮತ್ತು ಟೇಕ್‌ಅವೇ ಆರ್ಡರ್ ನಿರ್ವಹಿಸುತ್ತದೆಯೇ?",
    "Yes. Your online ordering page accepts delivery and takeaway orders directly, with no commission taken on any of them.": "ಹೌದು. ನಿಮ್ಮ ಆನ್‌ಲೈನ್ ಆರ್ಡರಿಂಗ್ ಪುಟ ಡೆಲಿವರಿ ಮತ್ತು ಟೇಕ್‌ಅವೇ ಆರ್ಡರ್‌ಗಳನ್ನು ನೇರವಾಗಿ ಸ್ವೀಕರಿಸುತ್ತದೆ, ಮತ್ತು ಅವುಗಳ ಮೇಲೆ ಯಾವುದೇ ಕಮಿಷನ್ ಇಲ್ಲ.",
    "Does it print KOT tickets for the kitchen?": "ಕಿಚನ್‌ಗೆ KOT ಟಿಕೆಟ್ ಪ್ರಿಂಟ್ ಆಗುತ್ತದೆಯೇ?",
    "Yes. Connect any standard thermal printer and each order prints as a KOT — or skip paper entirely and use the kitchen display screen instead.": "ಹೌದು. ಯಾವುದೇ ಸಾಮಾನ್ಯ ಥರ್ಮಲ್ ಪ್ರಿಂಟರ್ ಜೋಡಿಸಿ, ಪ್ರತಿ ಆರ್ಡರ್ KOT ಆಗಿ ಪ್ರಿಂಟ್ ಆಗುತ್ತದೆ — ಅಥವಾ ಕಾಗದ ಬಿಟ್ಟು ಕಿಚನ್ ಡಿಸ್‌ಪ್ಲೇ ಸ್ಕ್ರೀನ್ ಬಳಸಿ.",
    "Can I run offers, coupons and discounts?": "ಆಫರ್, ಕೂಪನ್ ಮತ್ತು ರಿಯಾಯಿತಿ ನೀಡಬಹುದೇ?",
    "Yes. Create percentage or flat-value coupons, happy-hour offers and item-level discounts, and switch them on or off whenever you like.": "ಹೌದು. ಶೇಕಡಾವಾರು ಅಥವಾ ನಿಗದಿತ ಮೊತ್ತದ ಕೂಪನ್, ಹ್ಯಾಪಿ-ಅವರ್ ಆಫರ್ ಮತ್ತು ಐಟಂವಾರು ರಿಯಾಯಿತಿ ರಚಿಸಿ, ಯಾವಾಗ ಬೇಕಾದರೂ ಆನ್ ಅಥವಾ ಆಫ್ ಮಾಡಿ.",
    "Can I manage staff accounts and permissions?": "ಸಿಬ್ಬಂದಿ ಖಾತೆ ಮತ್ತು ಅನುಮತಿಗಳನ್ನು ನಿರ್ವಹಿಸಬಹುದೇ?",
    "Yes. Add managers, cashiers and kitchen staff with role-based access, so each person only sees the screens they need.": "ಹೌದು. ಮ್ಯಾನೇಜರ್, ಕ್ಯಾಷಿಯರ್ ಮತ್ತು ಕಿಚನ್ ಸಿಬ್ಬಂದಿಯನ್ನು ಪಾತ್ರ ಆಧಾರಿತ ಪ್ರವೇಶದೊಂದಿಗೆ ಸೇರಿಸಿ, ಇದರಿಂದ ಪ್ರತಿಯೊಬ್ಬರಿಗೂ ಬೇಕಾದ ಪರದೆಗಳಷ್ಟೇ ಕಾಣಿಸುತ್ತವೆ.",
    "Can I track daily sales and best-selling items?": "ದೈನಂದಿನ ಮಾರಾಟ ಮತ್ತು ಹೆಚ್ಚು ಮಾರಾಟವಾಗುವ ಐಟಂಗಳನ್ನು ನೋಡಬಹುದೇ?",
    "Yes. The dashboard shows today's sales, order count and average bill value, along with your best-selling and slowest-moving items.": "ಹೌದು. ಡ್ಯಾಶ್‌ಬೋರ್ಡ್‌ನಲ್ಲಿ ಇಂದಿನ ಮಾರಾಟ, ಆರ್ಡರ್ ಸಂಖ್ಯೆ ಮತ್ತು ಸರಾಸರಿ ಬಿಲ್ ಮೊತ್ತದ ಜೊತೆಗೆ ಹೆಚ್ಚು ಹಾಗೂ ಕಡಿಮೆ ಮಾರಾಟವಾಗುವ ಐಟಂಗಳು ಕಾಣಿಸುತ್ತವೆ.",
    "Can I show my menu in more than one language?": "ಮೆನುವನ್ನು ಒಂದಕ್ಕಿಂತ ಹೆಚ್ಚು ಭಾಷೆಗಳಲ್ಲಿ ತೋರಿಸಬಹುದೇ?",
    "Yes. Item names and descriptions can be entered in the language your guests read, and this site itself is available in English, Hindi, Marathi and Kannada.": "ಹೌದು. ಐಟಂಗಳ ಹೆಸರು ಮತ್ತು ವಿವರಣೆಯನ್ನು ನಿಮ್ಮ ಅತಿಥಿಗಳು ಓದುವ ಭಾಷೆಯಲ್ಲಿ ನಮೂದಿಸಬಹುದು, ಮತ್ತು ಈ ಸೈಟ್ ಸ್ವತಃ ಇಂಗ್ಲಿಷ್, ಹಿಂದಿ, ಮರಾಠಿ ಮತ್ತು ಕನ್ನಡದಲ್ಲಿ ಲಭ್ಯವಿದೆ.",
    "What happens if my internet goes down?": "ಇಂಟರ್ನೆಟ್ ಬಂದ್ ಆದರೆ ಏನಾಗುತ್ತದೆ?",
    "PlatesOS is cloud-based, so it needs a connection. Guests order over their own mobile data, so table ordering keeps working even when your Wi-Fi drops — keep a backup hotspot for billing.": "PlatesOS ಕ್ಲೌಡ್ ಆಧಾರಿತ, ಆದ್ದರಿಂದ ಸಂಪರ್ಕ ಅಗತ್ಯ. ಅತಿಥಿಗಳು ತಮ್ಮ ಮೊಬೈಲ್ ಡೇಟಾದಿಂದ ಆರ್ಡರ್ ಮಾಡುತ್ತಾರೆ, ಆದ್ದರಿಂದ ನಿಮ್ಮ Wi-Fi ಹೋದರೂ ಟೇಬಲ್ ಆರ್ಡರಿಂಗ್ ಚಾಲ್ತಿಯಲ್ಲಿರುತ್ತದೆ — ಬಿಲ್ಲಿಂಗ್‌ಗೆ ಬ್ಯಾಕಪ್ ಹಾಟ್‌ಸ್ಪಾಟ್ ಇಟ್ಟುಕೊಳ್ಳಿ.",
    "How much does PlatesOS cost?": "PlatesOS ನ ಬೆಲೆ ಎಷ್ಟು?",
    "Starter is ₹999 a month and Growth is ₹2,499 a month, both billed flat with no commission. Enterprise is priced to your chain — talk to sales for a quote.": "ಸ್ಟಾರ್ಟರ್ ತಿಂಗಳಿಗೆ ₹999 ಮತ್ತು ಗ್ರೋತ್ ತಿಂಗಳಿಗೆ ₹2,499 — ಎರಡೂ ನಿಗದಿತ ಶುಲ್ಕ, ಕಮಿಷನ್ ಇಲ್ಲ. ಎಂಟರ್‌ಪ್ರೈಸ್ ಬೆಲೆ ನಿಮ್ಮ ಚೈನ್‌ಗೆ ತಕ್ಕಂತೆ — ಕೊಟೇಶನ್‌ಗಾಗಿ ಸೇಲ್ಸ್‌ನೊಂದಿಗೆ ಮಾತನಾಡಿ.",
    "Are there any setup or hidden fees?": "ಸೆಟಪ್ ಅಥವಾ ಗುಪ್ತ ಶುಲ್ಕ ಇದೆಯೇ?",
    "No setup fee and no hidden charges — your plan price is what you pay. Printed QR table products are the only separate, optional cost.": "ಸೆಟಪ್ ಶುಲ್ಕ ಇಲ್ಲ, ಗುಪ್ತ ಶುಲ್ಕವೂ ಇಲ್ಲ — ಪ್ಲಾನ್‌ನ ಬೆಲೆಯಷ್ಟೇ ನೀವು ಪಾವತಿಸುತ್ತೀರಿ. ಮುದ್ರಿತ QR ಟೇಬಲ್ ಉತ್ಪನ್ನಗಳಷ್ಟೇ ಪ್ರತ್ಯೇಕ ಹಾಗೂ ಐಚ್ಛಿಕ ವೆಚ್ಚ.",
    "How can I pay for my subscription?": "ಸಬ್‌ಸ್ಕ್ರಿಪ್ಷನ್‌ಗೆ ಹೇಗೆ ಪಾವತಿಸುವುದು?",
    "UPI, credit or debit card, net banking and bank transfer are all accepted, and you get a GST invoice for every payment.": "UPI, ಕ್ರೆಡಿಟ್ ಅಥವಾ ಡೆಬಿಟ್ ಕಾರ್ಡ್, ನೆಟ್ ಬ್ಯಾಂಕಿಂಗ್ ಮತ್ತು ಬ್ಯಾಂಕ್ ಟ್ರಾನ್ಸ್‌ಫರ್ — ಎಲ್ಲವೂ ಸ್ವೀಕಾರಾರ್ಹ, ಮತ್ತು ಪ್ರತಿ ಪಾವತಿಗೂ GST ಇನ್‌ವಾಯ್ಸ್ ಸಿಗುತ್ತದೆ.",
    "What is your refund and cancellation policy?": "ರೀಫಂಡ್ ಮತ್ತು ರದ್ದತಿ ನೀತಿ ಏನು?",
    "The {days}-day trial means you only pay once you're sure. After that you can cancel any time and you won't be billed from the next cycle — write to support for anything specific to your account.": "{days} ದಿನಗಳ ಟ್ರಯಲ್ ಎಂದರೆ ನಿಮಗೆ ಖಚಿತವಾದ ಮೇಲೆಯೇ ನೀವು ಪಾವತಿಸುತ್ತೀರಿ. ನಂತರ ಯಾವಾಗ ಬೇಕಾದರೂ ರದ್ದು ಮಾಡಿ, ಮುಂದಿನ ಸೈಕಲ್‌ನಿಂದ ಬಿಲ್ ಆಗುವುದಿಲ್ಲ — ನಿಮ್ಮ ಖಾತೆಗೆ ಸಂಬಂಧಿಸಿದ ವಿಶೇಷ ವಿಷಯಕ್ಕೆ ಬೆಂಬಲ ತಂಡಕ್ಕೆ ಬರೆಯಿರಿ.",
    "Is there a discount for annual billing or multiple outlets?": "ವಾರ್ಷಿಕ ಬಿಲ್ಲಿಂಗ್ ಅಥವಾ ಹಲವು ಔಟ್‌ಲೆಟ್‌ಗಳಿಗೆ ರಿಯಾಯಿತಿ ಇದೆಯೇ?",
    "Yes — annual plans and multi-outlet accounts are priced lower per outlet. Tell us your outlet count and we'll share a quote.": "ಹೌದು — ವಾರ್ಷಿಕ ಪ್ಲಾನ್ ಮತ್ತು ಹಲವು ಔಟ್‌ಲೆಟ್ ಖಾತೆಗಳಿಗೆ ಪ್ರತಿ ಔಟ್‌ಲೆಟ್ ಬೆಲೆ ಕಡಿಮೆ. ನಿಮ್ಮ ಔಟ್‌ಲೆಟ್‌ಗಳ ಸಂಖ್ಯೆ ತಿಳಿಸಿ, ನಾವು ಕೊಟೇಶನ್ ಕಳುಹಿಸುತ್ತೇವೆ.",
    "Can I try PlatesOS before paying?": "ಪಾವತಿಸುವ ಮೊದಲು PlatesOS ಬಳಸಿ ನೋಡಬಹುದೇ?",
    "Yes. Start a {days}-day free trial with no card details, set up your real menu, and decide at the end of it.": "ಹೌದು. ಕಾರ್ಡ್ ವಿವರಗಳಿಲ್ಲದೆ {days} ದಿನಗಳ ಉಚಿತ ಟ್ರಯಲ್ ಆರಂಭಿಸಿ, ನಿಮ್ಮ ನಿಜವಾದ ಮೆನು ಸೆಟ್ ಮಾಡಿ, ಕೊನೆಯಲ್ಲಿ ನಿರ್ಧರಿಸಿ.",
    "Can I book a demo with your team?": "ನಿಮ್ಮ ತಂಡದೊಂದಿಗೆ ಡೆಮೊ ಬುಕ್ ಮಾಡಬಹುದೇ?",
    "Yes. Pick “Book a demo” in the contact form or message us on WhatsApp, and we'll walk you through the product on a call at a time that suits you.": "ಹೌದು. ಸಂಪರ್ಕ ಫಾರ್ಮ್‌ನಲ್ಲಿ “ಡೆಮೊ ಬುಕ್ ಮಾಡಿ” ಆರಿಸಿ ಅಥವಾ WhatsApp ನಲ್ಲಿ ಸಂದೇಶ ಕಳುಹಿಸಿ — ನಿಮಗೆ ಅನುಕೂಲವಾದ ಸಮಯದಲ್ಲಿ ಕರೆಯಲ್ಲಿ ಪೂರ್ಣ ಉತ್ಪನ್ನ ತೋರಿಸುತ್ತೇವೆ.",
    "Do you train my staff on the system?": "ನನ್ನ ಸಿಬ್ಬಂದಿಗೆ ನೀವು ತರಬೇತಿ ನೀಡುತ್ತೀರಾ?",
    "Yes. We run a short walkthrough for your managers and kitchen staff, and leave you with simple guides they can refer back to.": "ಹೌದು. ನಿಮ್ಮ ಮ್ಯಾನೇಜರ್ ಮತ್ತು ಕಿಚನ್ ಸಿಬ್ಬಂದಿಗೆ ಚಿಕ್ಕ ವಾಕ್‌ಥ್ರೂ ನಡೆಸುತ್ತೇವೆ, ಮತ್ತು ನಂತರ ನೋಡಲು ಸರಳ ಮಾರ್ಗದರ್ಶಿಗಳನ್ನು ನೀಡುತ್ತೇವೆ.",
    "How do I get my table QR codes printed?": "ಟೇಬಲ್ QR ಕೋಡ್‌ಗಳನ್ನು ಹೇಗೆ ಮುದ್ರಿಸಿಕೊಳ್ಳುವುದು?",
    "Download print-ready QR PDFs from your dashboard and use any local printer, or order our printed table tents, tissue boxes and condiment caddies.": "ಡ್ಯಾಶ್‌ಬೋರ್ಡ್‌ನಿಂದ ಪ್ರಿಂಟ್-ರೆಡಿ QR PDF ಡೌನ್‌ಲೋಡ್ ಮಾಡಿ ಯಾವುದೇ ಸ್ಥಳೀಯ ಪ್ರಿಂಟರ್‌ನಲ್ಲಿ ಮುದ್ರಿಸಿ, ಅಥವಾ ನಮ್ಮ ಮುದ್ರಿತ ಟೇಬಲ್ ಟೆಂಟ್, ಟಿಶ್ಯೂ ಬಾಕ್ಸ್ ಮತ್ತು ಕಂಡಿಮೆಂಟ್ ಕ್ಯಾಡಿ ಆರ್ಡರ್ ಮಾಡಿ.",
    "How quickly do you reply to support requests?": "ಬೆಂಬಲ ವಿನಂತಿಗೆ ಎಷ್ಟು ಬೇಗ ಉತ್ತರ ಸಿಗುತ್ತದೆ?",
    "Email gets a reply within 24 hours, and WhatsApp or phone is usually answered within the same working hour, Mon – Fri, 9:00 AM – 6:00 PM.": "ಇಮೇಲ್‌ಗೆ 24 ಗಂಟೆಗಳಲ್ಲಿ ಉತ್ತರ ಸಿಗುತ್ತದೆ, ಮತ್ತು WhatsApp ಅಥವಾ ಫೋನ್‌ಗೆ ಸೋಮ – ಶುಕ್ರ, ಬೆಳಿಗ್ಗೆ 9:00 ರಿಂದ ಸಂಜೆ 6:00 ರ ನಡುವೆ ಸಾಮಾನ್ಯವಾಗಿ ಅದೇ ಗಂಟೆಯಲ್ಲಿ ಉತ್ತರ ಸಿಗುತ್ತದೆ.",
    "Which languages is PlatesOS available in?": "PlatesOS ಯಾವ ಭಾಷೆಗಳಲ್ಲಿ ಲಭ್ಯವಿದೆ?",
    "The platform and this site are available in English, Hindi, Marathi and Kannada, and support is available in all four.": "ಪ್ಲಾಟ್‌ಫಾರ್ಮ್ ಮತ್ತು ಈ ಸೈಟ್ ಇಂಗ್ಲಿಷ್, ಹಿಂದಿ, ಮರಾಠಿ ಮತ್ತು ಕನ್ನಡದಲ್ಲಿ ಲಭ್ಯವಿದೆ, ಮತ್ತು ಬೆಂಬಲವೂ ನಾಲ್ಕೂ ಭಾಷೆಗಳಲ್ಲಿ ಸಿಗುತ್ತದೆ.",
    // agent bot copy
    "💬 Ask a question": "💬 ಪ್ರಶ್ನೆ ಕೇಳಿ",
    "Chat with our team": "ನಮ್ಮ ತಂಡದೊಂದಿಗೆ ಚಾಟ್ ಮಾಡಿ",
    "Pick a topic, or tap a popular question.": "ಒಂದು ವಿಷಯ ಆರಿಸಿ, ಅಥವಾ ಜನಪ್ರಿಯ ಪ್ರಶ್ನೆಯ ಮೇಲೆ ಟ್ಯಾಪ್ ಮಾಡಿ.",
    "Popular": "ಜನಪ್ರಿಯ",
    "Browse by topic": "ವಿಷಯದ ಪ್ರಕಾರ ನೋಡಿ",
    "Other topics": "ಇತರ ವಿಷಯಗಳು",
    "Setup": "ಸೆಟಪ್",
  },
};

const LangCtx = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: "en", setLang: () => {} });
// Translate by English source string; falls back to English when a phrase isn't in the table.
const useT = () => {
  const { lang } = useContext(LangCtx);
  return (en: string) => (lang === "en" ? en : TRANSLATIONS[lang][en] ?? en);
};

const LanguageMenu = () => {
  const { lang, setLang } = useContext(LangCtx);
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const current = LANGS.find((l) => l.id === lang)!;
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={t("Language")}
        className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-2 text-sm text-slate-700 hover:bg-slate-50">
        <Globe className="h-4 w-4" style={{ color: BRAND.primary }} />
        <span className="font-medium">{current.short}</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul role="menu" initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }} transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-40 overflow-hidden rounded-xl border border-slate-100 bg-white py-1 shadow-xl">
            {LANGS.map((l) => (
              <li key={l.id}>
                <button role="menuitemradio" aria-checked={l.id === lang}
                  onClick={() => { setLang(l.id); setOpen(false); }}
                  className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-slate-50"
                  style={l.id === lang ? { color: BRAND.primary, fontWeight: 600 } : { color: "#334155" }}>
                  {l.label}
                  {l.id === lang && <Check className="h-4 w-4" />}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
};

// ====================
// SHARED UI
// ====================
// Uploaded logo from Platform settings; the built-in PlatesOS mark when none
// is set or the image fails to load.
const Logo = () => {
  const { logoUrl } = useSite();
  const [broken, setBroken] = useState(false);
  const src = broken ? null : safeUrl(logoUrl);
  useEffect(() => setBroken(false), [logoUrl]);
  return (
    <button onClick={() => scrollTo("home")} className="flex items-center gap-2" aria-label={BRAND.name}>
      {src ? (
        <img src={src} alt={BRAND.name} className="h-9 w-auto max-w-[180px] object-contain" onError={() => setBroken(true)} />
      ) : (
        <>
          <span className="h-9 w-9 rounded-xl grid place-items-center text-white" style={{ background: BRAND.primary }}>
            <Utensils className="h-5 w-5" />
          </span>
          <span className="text-xl font-bold" style={{ color: BRAND.dark }}>
            Plates<span style={{ color: BRAND.primary }}>OS</span>
          </span>
        </>
      )}
    </button>
  );
};

const Pill = ({ children }: { children: ReactNode }) => (
  <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
    style={{ background: BRAND.soft, color: BRAND.primary }}>
    <Zap className="h-3 w-3" /> {children}
  </span>
);

const Reveal = ({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) => (
  <motion.div className={className} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.5, delay }}>
    {children}
  </motion.div>
);

const PrimaryBtn = ({ children, onClick, to }: { children: ReactNode; onClick?: () => void; to?: string }) => {
  const cls = "inline-flex items-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:brightness-110 transition";
  return to ? (
    <Link to={to} className={cls} style={{ background: BRAND.primary }}>{children}</Link>
  ) : (
    <button onClick={onClick} className={cls} style={{ background: BRAND.primary }}>{children}</button>
  );
};

// Brand SVG icons
const InstagramIcon = () => (
  <svg viewBox="0 0 24 24" className="h-full w-full"><defs><linearGradient id="ig" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#FEDA75"/><stop offset=".35" stopColor="#FA7E1E"/><stop offset=".6" stopColor="#D62976"/><stop offset="1" stopColor="#4F5BD5"/></linearGradient></defs><rect width="24" height="24" rx="6" fill="url(#ig)"/><rect x="5" y="5" width="14" height="14" rx="4" fill="none" stroke="#fff" strokeWidth="1.8"/><circle cx="12" cy="12" r="3.3" fill="none" stroke="#fff" strokeWidth="1.8"/><circle cx="16.3" cy="7.7" r="1" fill="#fff"/></svg>
);
const FacebookIcon = () => (
  <svg viewBox="0 0 24 24" className="h-full w-full"><rect width="24" height="24" rx="6" fill="#1877F2"/><path d="M13.3 20v-6.2h2.1l.3-2.4h-2.4V9.9c0-.7.2-1.2 1.2-1.2h1.3V6.6c-.2 0-1-.1-1.9-.1-1.9 0-3.2 1.2-3.2 3.3v1.8H8.6v2.4h2.1V20h2.6z" fill="#fff"/></svg>
);
const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" className="h-full w-full"><rect width="24" height="24" rx="6" fill="#25D366"/><path d="M12 5.2a6.8 6.8 0 0 0-5.9 10.2L5.2 18.8l3.5-.9A6.8 6.8 0 1 0 12 5.2zm0 12.3c-1 0-2-.3-2.8-.8l-.2-.1-2 .5.5-2-.1-.2a5.6 5.6 0 1 1 4.6 2.6zm3.1-4.2c-.2-.1-1-.5-1.2-.5-.2-.1-.3-.1-.4.1l-.5.7c-.1.1-.2.1-.4 0-.2-.1-.7-.3-1.4-.9-.5-.4-.9-1-1-1.2-.1-.2 0-.3.1-.4l.3-.3.2-.3v-.3l-.5-1.3c-.1-.3-.3-.3-.4-.3h-.4c-.1 0-.3.1-.5.2-.2.2-.7.7-.7 1.6s.7 1.9.8 2c.1.1 1.4 2.1 3.3 2.9 1.6.6 1.9.5 2.3.5.4-.1 1-.4 1.2-.8.1-.4.1-.8.1-.8-.1-.1-.2-.1-.4-.2z" fill="#fff"/></svg>
);
const LinkedInIcon = () => (
  <svg viewBox="0 0 24 24" className="h-full w-full"><rect width="24" height="24" rx="6" fill="#0A66C2"/><path d="M8.3 18H5.8v-7.8h2.5V18zM7 9.1a1.4 1.4 0 1 1 0-2.9 1.4 1.4 0 0 1 0 2.9zM18.2 18h-2.5v-3.8c0-.9 0-2.1-1.3-2.1s-1.5 1-1.5 2V18h-2.5v-7.8h2.4v1.1c.3-.6 1.1-1.3 2.3-1.3 2.5 0 3 1.6 3 3.8V18z" fill="#fff"/></svg>
);

// Only the networks with a valid saved link are rendered.
const socialsFor = (site: Site) => [
  { key: "instagram", name: "Instagram", href: safeUrl(site.instagram), Icon: InstagramIcon },
  { key: "facebook", name: "Facebook", href: safeUrl(site.facebook), Icon: FacebookIcon },
  { key: "whatsapp", name: "WhatsApp", href: whatsappHref(site.whatsapp), Icon: WhatsAppIcon },
  { key: "linkedin", name: "LinkedIn", href: safeUrl(site.linkedin), Icon: LinkedInIcon },
].filter((s): s is typeof s & { href: string } => !!s.href);

// ====================
// NAVBAR
// ====================
const Navbar = () => {
  const t = useT();
  const [active, setActive] = useState("home");
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: "-45% 0px -50% 0px" },
    );
    NAV.forEach((n) => { const el = document.getElementById(n.id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, []);
  return (
    <header className="sticky top-0 z-50 bg-white/85 backdrop-blur border-b border-slate-100">
      <div className="max-w-7xl mx-auto px-5 sm:px-6 h-16 flex items-center justify-between">
        <Logo />
        <nav className="hidden md:flex items-center gap-8 text-sm">
          {NAV.map((n) => (
            <button key={n.id} onClick={() => scrollTo(n.id)}
              className="relative py-5 transition-colors"
              style={{ color: active === n.id ? BRAND.primary : "#475569", fontWeight: active === n.id ? 600 : 400 }}>
              {t(n.label)}
              {active === n.id && (
                <motion.span layoutId="navline" className="absolute left-0 right-0 bottom-3 h-0.5 rounded-full"
                  style={{ background: BRAND.primary }} />
              )}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link to="/auth" className="hidden sm:inline text-sm text-slate-700 hover:text-slate-900">{t("Sign in")}</Link>
          <Link to="/auth" className="hidden sm:inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white"
            style={{ background: BRAND.primary }}>
            {t("Get started")} <ArrowRight className="h-4 w-4" />
          </Link>
          <LanguageMenu />
          <button onClick={() => setMenu((o) => !o)} aria-expanded={menu} aria-controls="mobile-nav"
            aria-label={menu ? "Close menu" : "Open menu"}
            className="md:hidden h-10 w-10 grid place-items-center rounded-lg border border-slate-200 text-slate-700">
            {menu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* mobile drawer */}
      <AnimatePresence>
        {menu && (
          <motion.nav id="mobile-nav" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }}
            className="md:hidden overflow-hidden border-t border-slate-100 bg-white">
            <div className="px-6 py-4 space-y-1">
              {NAV.map((n) => (
                <button key={n.id} onClick={() => { setMenu(false); scrollTo(n.id); }}
                  className="block w-full rounded-lg px-3 py-2.5 text-left text-[15px]"
                  style={active === n.id ? { background: BRAND.soft, color: BRAND.primary, fontWeight: 600 } : { color: "#334155" }}>
                  {t(n.label)}
                </button>
              ))}
              <div className="flex gap-3 pt-3">
                <Link to="/auth" onClick={() => setMenu(false)}
                  className="flex-1 rounded-lg border border-slate-200 py-2.5 text-center text-sm font-medium text-slate-700">
                  {t("Sign in")}
                </Link>
                <Link to="/auth" onClick={() => setMenu(false)}
                  className="flex-1 rounded-lg py-2.5 text-center text-sm font-semibold text-white" style={{ background: BRAND.primary }}>
                  {t("Get started")}
                </Link>
              </div>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
};

// Scales a fixed-size mockup down to fit whatever width is available (phones, tablets)
const FitScale = ({ w, h, children }: { w: number; h: number; children: ReactNode }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setScale(Math.min(1, el.clientWidth / w));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [w]);
  return (
    <div ref={ref} className="w-full flex justify-center">
      <div style={{ width: w * scale, height: h * scale }}>
        <div style={{ width: w, height: h, transform: `scale(${scale})`, transformOrigin: "top left" }}>{children}</div>
      </div>
    </div>
  );
};

// ====================
// PRODUCT CAROUSEL — slide mockups
// ====================
const Tablet = ({ children }: { children: ReactNode }) => (
  <div className="rounded-[28px] bg-slate-900 p-3 shadow-2xl shadow-slate-900/30 w-[440px] shrink-0">
    <div className="rounded-[18px] bg-white overflow-hidden h-[280px] flex text-[10px]">{children}</div>
  </div>
);

const Phone_ = ({ children }: { children: ReactNode }) => (
  <div className="rounded-[26px] bg-slate-900 p-2 shadow-2xl shadow-slate-900/40 w-[150px]">
    <div className="rounded-[20px] bg-white overflow-hidden h-[290px] text-[9px]">{children}</div>
  </div>
);

const Sidebar = ({ active }: { active: string }) => (
  <div className="w-24 border-r border-slate-100 p-2 space-y-1">
    <div className="flex items-center gap-1 font-bold mb-2" style={{ color: BRAND.dark }}>
      <span className="h-4 w-4 rounded grid place-items-center text-white" style={{ background: BRAND.primary }}><Utensils className="h-2.5 w-2.5"/></span>PlatesOS
    </div>
    {["Dashboard", "Orders", "Menu", "Tables", "Kitchen", "Reports", "Settings"].map((i) => (
      <div key={i} className="rounded px-1.5 py-1"
        style={i === active ? { background: BRAND.soft, color: BRAND.primary, fontWeight: 600 } : { color: "#64748b" }}>{i}</div>
    ))}
  </div>
);

const Status = ({ s }: { s: string }) => {
  const map: Record<string, string> = { Preparing: "bg-amber-100 text-amber-700", Delivered: "bg-emerald-100 text-emerald-700", Ready: "bg-blue-100 text-blue-700", New: "bg-rose-100 text-rose-700" };
  return <span className={`rounded px-1.5 py-0.5 text-[8px] font-medium ${map[s]}`}>{s}</span>;
};

const DashboardSlide = () => (
  <div className="relative flex items-end">
    <div className="relative z-10 -mr-16 mb-[-10px]">
      <Phone_>
        <div className="p-2">
          <div className="font-bold mb-1" style={{ color: BRAND.primary }}>PlatesOS</div>
          <div className="h-24 rounded-lg bg-gradient-to-br from-orange-200 via-amber-300 to-red-300 grid place-items-center text-2xl">🍛</div>
          <div className="font-semibold mt-2">Paneer Butter Masala</div>
          <div className="text-slate-400">Rich & creamy, served with naan</div>
          <div className="font-semibold mt-1">₹290</div>
          <div className="mt-2 rounded-md text-white text-center py-1" style={{ background: BRAND.primary }}>Add to cart</div>
        </div>
      </Phone_>
    </div>
    <Tablet>
      <Sidebar active="Dashboard" />
      <div className="flex-1 p-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border p-2"><div className="text-slate-400">Total Orders</div><div className="text-sm font-bold">142</div><div className="text-emerald-600">↑ 10%</div></div>
          <div className="rounded-lg border p-2"><div className="text-slate-400">Today's Revenue</div><div className="text-sm font-bold">₹28,450</div><div className="text-emerald-600">↑ 10%</div></div>
        </div>
        <div className="rounded-lg border p-2">
          <div className="font-semibold">Sales Overview</div>
          <svg viewBox="0 0 200 50" className="w-full h-12"><polyline fill="none" stroke={BRAND.primary} strokeWidth="2" points="0,40 20,32 40,36 60,24 80,28 100,18 120,22 140,12 160,16 180,6 200,10"/></svg>
        </div>
        <div className="rounded-lg border p-2 space-y-1">
          <div className="font-semibold">Recent Orders</div>
          {[["Paneer Butter Masala", "Preparing"], ["Margherita Pizza", "Delivered"], ["Cold Coffee", "Delivered"]].map(([n, s]) => (
            <div key={n} className="flex justify-between items-center"><span>{n}</span><Status s={s} /></div>
          ))}
        </div>
      </div>
    </Tablet>
  </div>
);

// Realistic QR mock: 25×25 grid with finder, timing & alignment patterns + centre logo
const QR_N = 25;
const inBox = (r: number, c: number, r0: number, c0: number, s: number) =>
  r >= r0 && r < r0 + s && c >= c0 && c < c0 + s;
const ring = (r: number, c: number, r0: number, c0: number, s: number) => {
  const y = r - r0, x = c - c0;
  return y === 0 || x === 0 || y === s - 1 || x === s - 1 || (y >= 2 && y <= s - 3 && x >= 2 && x <= s - 3);
};
const QR_CELLS: [number, number][] = (() => {
  const out: [number, number][] = [];
  const finders = [[0, 0], [0, QR_N - 7], [QR_N - 7, 0]];
  for (let r = 0; r < QR_N; r++) {
    for (let c = 0; c < QR_N; c++) {
      let dark: boolean;
      const f = finders.find(([fr, fc]) => inBox(r, c, fr - 1, fc - 1, 9));
      if (f) dark = inBox(r, c, f[0], f[1], 7) && ring(r, c, f[0], f[1], 7);
      else if (inBox(r, c, 16, 16, 5)) dark = ring(r, c, 16, 16, 5);
      else if (r === 6 || c === 6) dark = (r + c) % 2 === 0;
      else if (inBox(r, c, 9, 9, 7)) dark = false; // logo space
      else {
        const n = Math.sin(r * 12.9898 + c * 78.233) * 43758.5453;
        dark = n - Math.floor(n) > 0.5;
      }
      if (dark) out.push([r, c]);
    }
  }
  return out;
})();

const QRCodeMock = () => (
  <div className="relative mx-auto w-32 h-32">
    <svg viewBox={`-1 -1 ${QR_N + 2} ${QR_N + 2}`} className="w-full h-full" shapeRendering="crispEdges" aria-label="QR code for Table 5">
      <rect x={-1} y={-1} width={QR_N + 2} height={QR_N + 2} fill="#fff" />
      {QR_CELLS.map(([r, c]) => <rect key={`${r}-${c}`} x={c} y={r} width={1.02} height={1.02} fill={BRAND.dark} />)}
    </svg>
    <span className="absolute inset-0 m-auto h-7 w-7 rounded-md grid place-items-center text-white ring-2 ring-white"
      style={{ background: BRAND.primary }}>
      <Utensils className="h-4 w-4" />
    </span>
  </div>
);

const QRSlide = () => (
  <div className="flex items-center gap-6">
    <div className="rounded-2xl bg-white shadow-xl p-5 w-44 text-center">
      <div className="font-bold text-lg" style={{ color: BRAND.dark }}>Table 5</div>
      <div className="text-xs text-slate-400 mb-3">Scan to order</div>
      <QRCodeMock />
      <div className="mt-3 text-xs font-medium" style={{ color: BRAND.primary }}>platesos.com/t/5</div>
    </div>
    <Phone_>
      <div className="p-2 space-y-1.5">
        <div className="flex justify-between font-semibold"><span>Table 5</span><span style={{ color: BRAND.primary }}>Menu</span></div>
        {[["🍕", "Margherita", "₹340"], ["🍔", "Veg Burger", "₹180"], ["☕", "Cold Coffee", "₹150"], ["🍜", "Hakka Noodles", "₹220"]].map(([e, n, p]) => (
          <div key={n} className="flex items-center gap-1.5 rounded-lg border p-1.5">
            <span className="text-base">{e}</span><div className="flex-1"><div className="font-medium">{n}</div><div className="text-slate-400">{p}</div></div>
            <span className="rounded px-1 text-white" style={{ background: BRAND.primary }}>+</span>
          </div>
        ))}
        <div className="rounded-md text-white text-center py-1.5 font-semibold" style={{ background: BRAND.primary }}>Place order · ₹520</div>
      </div>
    </Phone_>
  </div>
);

const OnlineSlide = () => (
  <Tablet>
    <div className="flex-1 flex flex-col">
      <div className="h-16 bg-gradient-to-r from-blue-600 to-sky-400 text-white p-3">
        <div className="font-bold text-sm">Spice Garden</div><div>Order online · Delivery in 30 min</div>
      </div>
      <div className="p-3 grid grid-cols-3 gap-2 flex-1">
        {[["🍛", "Butter Chicken", "₹360"], ["🥗", "Greek Salad", "₹240"], ["🍝", "Alfredo Pasta", "₹310"], ["🍰", "Cheesecake", "₹190"], ["🥤", "Mojito", "₹140"], ["🌯", "Paneer Wrap", "₹200"]].map(([e, n, p]) => (
          <div key={n} className="rounded-lg border p-2 flex flex-col">
            <div className="h-10 rounded bg-slate-50 grid place-items-center text-xl">{e}</div>
            <div className="font-medium mt-1">{n}</div>
            <div className="flex justify-between items-center mt-auto"><span className="text-slate-500">{p}</span><span className="rounded px-1.5 text-white" style={{ background: BRAND.primary }}>Add</span></div>
          </div>
        ))}
      </div>
    </div>
    <div className="w-32 border-l border-slate-100 p-2 space-y-1.5">
      <div className="font-semibold">Your cart</div>
      <div className="flex justify-between"><span>Butter Chicken</span><span>₹360</span></div>
      <div className="flex justify-between"><span>Mojito ×2</span><span>₹280</span></div>
      <div className="border-t pt-1 flex justify-between font-bold"><span>Total</span><span>₹640</span></div>
      <div className="text-slate-400">UPI · PhonePe · GPay</div>
      <div className="rounded-md text-white text-center py-1" style={{ background: BRAND.primary }}>Checkout</div>
    </div>
  </Tablet>
);

const KitchenSlide = () => (
  <Tablet>
    <div className="flex-1 p-3">
      <div className="flex justify-between mb-2"><span className="font-bold text-sm">Kitchen Display</span><span className="text-emerald-600">● Live</span></div>
      <div className="grid grid-cols-3 gap-2">
        {[
          { col: "New", items: [["T3", "Veg Burger ×2"], ["T8", "Masala Dosa"]] },
          { col: "Preparing", items: [["T5", "Paneer Butter Masala"], ["#41", "Hakka Noodles"]] },
          { col: "Ready", items: [["T1", "Cold Coffee ×3"], ["#39", "Margherita"]] },
        ].map((c) => (
          <div key={c.col} className="rounded-lg bg-slate-50 p-2 space-y-1.5">
            <div className="flex justify-between font-semibold"><span>{c.col}</span><Status s={c.col} /></div>
            {c.items.map(([t, i]) => (
              <div key={t} className="rounded-md bg-white border p-1.5">
                <div className="font-bold" style={{ color: BRAND.primary }}>{t}</div><div>{i}</div>
                <div className="text-slate-400">{c.col === "New" ? "just now" : "6 min"}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  </Tablet>
);

const AnalyticsSlide = () => (
  <Tablet>
    <Sidebar active="Reports" />
    <div className="flex-1 p-3 space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {[["Revenue", "₹4.2L"], ["Orders", "3,812"], ["Avg ticket", "₹412"]].map(([k, v]) => (
          <div key={k} className="rounded-lg border p-2"><div className="text-slate-400">{k}</div><div className="text-sm font-bold">{v}</div></div>
        ))}
      </div>
      <div className="rounded-lg border p-2">
        <div className="font-semibold mb-1">Weekly revenue</div>
        <div className="flex items-end gap-2 h-20">
          {[40, 65, 50, 80, 70, 95, 85].map((h, i) => (
            <div key={i} className="flex-1 rounded-t" style={{ height: `${h}%`, background: i === 5 ? BRAND.primary : "#BFDBFE" }} />
          ))}
        </div>
      </div>
      <div className="rounded-lg border p-2 space-y-1">
        <div className="font-semibold">Top items</div>
        {[["Paneer Butter Masala", 82], ["Cold Coffee", 64], ["Veg Burger", 48]].map(([n, v]) => (
          <div key={n as string} className="flex items-center gap-2"><span className="w-28">{n}</span>
            <div className="flex-1 h-1.5 rounded bg-slate-100"><div className="h-1.5 rounded" style={{ width: `${v}%`, background: BRAND.primary }} /></div></div>
        ))}
      </div>
    </div>
  </Tablet>
);

const SLIDES = [
  { label: "Dashboard", icon: LayoutDashboard, Comp: DashboardSlide },
  { label: "QR Table Ordering", icon: QrCode, Comp: QRSlide },
  { label: "Online Ordering", icon: ShoppingCart, Comp: OnlineSlide },
  { label: "Kitchen Operations", icon: ChefHat, Comp: KitchenSlide },
  { label: "Analytics", icon: BarChart3, Comp: AnalyticsSlide },
];

const ProductCarousel = () => {
  const t = useT();
  const [[index, dir], setState] = useState<[number, number]>([0, 1]);
  const [paused, setPaused] = useState(false);
  const go = (d: number) => setState(([i]) => [(i + d + SLIDES.length) % SLIDES.length, d]);
  const jump = (i: number) => setState(([cur]) => [i, i > cur ? 1 : -1]);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => go(1), 3500);
    return () => clearInterval(t);
  }, [paused]);

  const { Comp, icon: Icon, label } = SLIDES[index];
  return (
    <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} className="relative">
      <div className="flex justify-center mb-4 h-9">
        <motion.div layout transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="inline-flex items-center rounded-full px-4 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 overflow-hidden"
          style={{ background: BRAND.primary }} aria-live="polite">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={label}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.3 }} className="inline-flex items-center gap-2 whitespace-nowrap">
              <Icon className="h-4 w-4" />{t(label)}
            </motion.span>
          </AnimatePresence>
        </motion.div>
      </div>
      <FitScale w={540} h={340}>
        <div className="relative h-full w-full grid place-items-center overflow-hidden">
          <AnimatePresence mode="wait" custom={dir}>
            <motion.div key={index} custom={dir}
              initial={{ opacity: 0, x: dir * 60, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: dir * -60, scale: 0.96 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
              <Comp />
            </motion.div>
          </AnimatePresence>
        </div>
      </FitScale>
      <div className="mt-4 flex items-center justify-center gap-4">
        <button aria-label="Previous slide" onClick={() => go(-1)} className="h-9 w-9 rounded-full bg-white shadow grid place-items-center hover:bg-slate-50" style={{ color: BRAND.primary }}><ChevronLeft className="h-4 w-4" /></button>
        <div className="flex gap-1.5">
          {SLIDES.map((s, i) => (
            <button key={s.label} aria-label={`Go to ${s.label}`} onClick={() => jump(i)}
              className="h-2 rounded-full transition-all" style={{ width: i === index ? 22 : 8, background: i === index ? BRAND.primary : "#cbd5e1" }} />
          ))}
        </div>
        <button aria-label="Next slide" onClick={() => go(1)} className="h-9 w-9 rounded-full bg-white shadow grid place-items-center hover:bg-slate-50" style={{ color: BRAND.primary }}><ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
};

// ====================
// VIDEO MODAL
// ====================
const toEmbed = (url: string) => {
  if (!/youtube\.com|youtu\.be/.test(url)) return null;
  const m = url.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/);
  return m ? `https://www.youtube.com/embed/${m[1]}?autoplay=1&rel=0&modestbranding=1` : null;
};

const VideoModal = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, onClose]);

  const embed = toEmbed(DEMO_VIDEO_URL);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[100] grid place-items-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-sm"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
          role="dialog" aria-modal="true" aria-label="PlatesOS demo video">
          <motion.div className="relative w-full max-w-4xl" onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.92, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
            <div className="relative aspect-video w-full overflow-hidden rounded-xl sm:rounded-2xl bg-black shadow-2xl">
              {embed ? (
                <iframe src={embed} title="PlatesOS demo" className="h-full w-full"
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
              ) : (
                <video src={DEMO_VIDEO_URL} className="h-full w-full" autoPlay muted controls playsInline />
              )}
              <button onClick={onClose} autoFocus aria-label="Close video"
                className="absolute top-2 right-2 sm:top-3 sm:right-3 z-10 h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-black/55 text-white backdrop-blur grid place-items-center transition hover:bg-black/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-white">
                <X className="h-5 w-5" />
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ====================
// HERO
// ====================
const Hero = () => {
  const t = useT();
  const site = useSite();
  const [videoOpen, setVideoOpen] = useState(false);
  return (
    <section id="home" className="relative overflow-hidden scroll-mt-16">
      <div className="absolute inset-0 -z-10" style={{ background: `radial-gradient(ellipse at 80% 0%, ${BRAND.soft}, transparent 60%), linear-gradient(180deg,#fff, #F6F9FF)` }} />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-14 lg:py-20 grid grid-cols-1 lg:grid-cols-[1fr_1.15fr] gap-8 sm:gap-10 lg:gap-6 items-center overflow-hidden">
        <Reveal>
          <Pill>{t("Modern Restaurant Management Platform")}</Pill>
          <h1 className="mt-4 sm:mt-5 text-[clamp(2.15rem,8.3vw,3.7rem)] font-extrabold tracking-tight leading-[1.08]" style={{ color: BRAND.dark }}>
            <span className="block whitespace-nowrap">{t("Run Your Restaurant.")}</span>
            <span className="block" style={{ color: BRAND.primary }}>{t("Smarter.")}</span>
          </h1>
          <p className="mt-4 sm:mt-5 text-base sm:text-lg text-slate-600 max-w-md leading-relaxed">
            {t("One powerful platform to manage orders, tables, bookings, QR ordering, and daily operations — all in one place.")}
          </p>
          <div className="mt-6 sm:mt-8 flex flex-col xs:flex-row sm:flex-row gap-3 w-full">
            <PrimaryBtn to="/auth">
              <span className="text-center flex-1">{t("Start free trial")}</span>
              <ArrowRight className="h-4 w-4" />
            </PrimaryBtn>
            <button onClick={() => setVideoOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold bg-white border border-slate-200 shadow-sm hover:bg-slate-50 w-full sm:w-auto" style={{ color: BRAND.dark }}>
              <PlayCircle className="h-4 w-4" style={{ color: BRAND.primary }} /><span>{t("Watch video")}</span>
            </button>
          </div>
          <div className="mt-5 sm:mt-6 flex flex-wrap gap-x-4 sm:gap-x-5 gap-y-2 text-xs sm:text-sm text-slate-500">
            {["No commission", "{days}-day free trial", "Easy setup"].map((label) => (
              <span key={label} className="flex items-center gap-1.5"><Check className="h-4 w-4 shrink-0" style={{ color: BRAND.primary }} />{fillTokens(t(label), site)}</span>
            ))}
          </div>
        </Reveal>
        {/* Product carousel */}
        <div className="w-full min-w-0">
          <ProductCarousel />
        </div>
      </div>
      <VideoModal open={videoOpen} onClose={() => setVideoOpen(false)} />
    </section>
  );
};

// ====================
// FEATURES
// ====================
const FEATURES = [
  { icon: ShoppingCart, title: "Online Ordering", body: "Let customers order from anywhere.", tag: "Delivery & takeaway" },
  { icon: QrCode, title: "QR Table Ordering", body: "Unique QR codes for every table.", tag: "Scan · Order · Pay" },
  { icon: CalendarDays, title: "Table & Booking Management", body: "Manage reservations and table allocation.", tag: "Live floor plan" },
  { icon: LineChart, title: "Restaurant Dashboard", body: "Track orders, sales, and performance in real-time.", tag: "Real-time" },
  { icon: FileText, title: "Orders, Reports & Invoices", body: "Stay organized with detailed reports.", tag: "GST-ready invoices" },
  { icon: Percent, title: "No Commission", body: "Keep 100% of your earnings.", tag: "0% per order" },
];

const FeatureCard = ({ f }: { f: (typeof FEATURES)[number] }) => {
  const t = useT();
  return (
    <motion.div whileHover={{ y: -6 }} transition={{ type: "spring", stiffness: 300, damping: 22 }}
      className="group relative h-full min-h-[210px] sm:min-h-[240px] overflow-hidden rounded-3xl p-6 sm:p-7 bg-white border border-slate-200 hover:border-transparent hover:shadow-xl hover:shadow-blue-500/25 transition-[box-shadow,border-color] duration-300">
      {/* blue fill on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{ background: `linear-gradient(135deg, #3D9BFF, ${BRAND.primary})` }} />

      <div className="relative">
        <div className="h-12 w-12 rounded-2xl grid place-items-center text-white shadow-lg shadow-blue-500/30 bg-gradient-to-br from-[#0B7BFF] to-[#4DA3FF] transition-all duration-300 group-hover:scale-110 group-hover:-rotate-6 group-hover:from-white/15 group-hover:to-white/15 group-hover:shadow-none">
          <f.icon className="h-6 w-6" />
        </div>
        <span className="mt-5 inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold bg-[#EAF3FF] text-[#0B7BFF] group-hover:bg-white/15 group-hover:text-white transition-colors duration-300">
          {t(f.tag)}
        </span>
        <h3 className="mt-3 text-lg font-bold text-[#0B1B3F] group-hover:text-white transition-colors duration-300">{t(f.title)}</h3>
        <p className="mt-1.5 text-sm text-slate-500 group-hover:text-white transition-colors duration-300">{t(f.body)}</p>
      </div>
    </motion.div>
  );
};

const Features = () => {
  const t = useT();
  return (
    <section id="features" className="py-14 sm:py-20 scroll-mt-16">
      <div className="max-w-7xl mx-auto px-5 sm:px-6">
        <Reveal>
          <div className="text-center max-w-2xl mx-auto">
            <Pill>{t("Everything you need")}</Pill>
            <h2 className="mt-4 text-3xl md:text-4xl font-extrabold" style={{ color: BRAND.dark }}>
              {t("Powerful features for")} <span style={{ color: BRAND.primary }}>{t("your restaurant")}</span>
            </h2>
            <p className="mt-4 text-slate-600">{t("From online orders to detailed reports, PlatesOS gives you the tools to run your restaurant smoothly and efficiently.")}</p>
          </div>
        </Reveal>
        <div className="mt-10 sm:mt-14 grid gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} className="h-full" delay={(i % 3) * 0.08}><FeatureCard f={f} /></Reveal>
          ))}
        </div>
      </div>
    </section>
  );
};

// ====================
// PRODUCTS (physical QR merchandise)
// ====================
type View = "front" | "back" | "left" | "right";
const VIEWS: { id: View; label: string }[] = [
  { id: "front", label: "Front" }, { id: "back", label: "Back" },
  { id: "left", label: "Left" }, { id: "right", label: "Right" },
];
type ArtProps = { view: View };

const QRPanel = ({ x, y, size, quiet = 0.6 }: { x: number; y: number; size: number; quiet?: number }) => {
  const u = size / (QR_N + quiet * 2);
  return (
    <g transform={`translate(${x},${y})`}>
      <rect width={size} height={size} rx={size * 0.06} fill="#fff" />
      <g transform={`translate(${quiet * u},${quiet * u}) scale(${u})`}>
        {QR_CELLS.map(([r, c]) => <rect key={`${r}-${c}`} x={c} y={r} width={1.04} height={1.04} fill={BRAND.dark} />)}
        <rect x={9.6} y={9.6} width={5.8} height={5.8} rx={1.4} fill={BRAND.primary} />
        <path d="M11.6 11.4v1.6a1 1 0 0 0 2 0v-1.6M12.6 13v2.6M13.8 11.4v4.2" stroke="#fff" strokeWidth=".5" fill="none" strokeLinecap="round" />
      </g>
    </g>
  );
};

const TableScene = ({ children, label }: { children: ReactNode; label: string }) => (
  <svg viewBox="0 0 320 240" className="h-full w-full" role="img" aria-label={label}>
    <defs>
      <linearGradient id="pw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#F2F7FF" /><stop offset="1" stopColor="#E3EDFB" /></linearGradient>
      <linearGradient id="pt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#EADBC6" /><stop offset="1" stopColor="#D7C2A6" /></linearGradient>
      <linearGradient id="acr" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#FFFFFF" stopOpacity=".95" /><stop offset=".45" stopColor="#DCEBFF" stopOpacity=".85" /><stop offset="1" stopColor="#FFFFFF" stopOpacity=".95" />
      </linearGradient>
      <linearGradient id="pbrand" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#4DA3FF" /><stop offset="1" stopColor="#0B7BFF" /></linearGradient>
    </defs>
    <rect width="320" height="240" fill="url(#pw)" />
    <circle cx="252" cy="52" r="46" fill="#fff" opacity=".55" />
    <rect y="168" width="320" height="72" fill="url(#pt)" />
    <rect y="166" width="320" height="4" fill="#C9B396" opacity=".7" />
    <g opacity=".25" stroke="#B79C78" strokeWidth="1"><path d="M0 190h320M0 212h320" /></g>
    {children}
  </svg>
);

const Shadow = ({ cx, rx = 54, cy = 196 }: { cx: number; rx?: number; cy?: number }) => (
  <ellipse cx={cx} cy={cy} rx={rx} ry="8" fill="#7A6247" opacity=".28" />
);

// Mirrors geometry for the opposite side view (text is added outside this wrapper)
const Flip = ({ on, children }: { on: boolean; children: ReactNode }) => (
  <g transform={on ? "translate(320,0) scale(-1,1)" : undefined}>{children}</g>
);

const Wordmark = ({ x, y, w = 72, h = 26, fs = 13 }: { x: number; y: number; w?: number; h?: number; fs?: number }) => (
  <g>
    <rect x={x} y={y} width={w} height={h} rx={h / 3.5} fill="url(#pbrand)" />
    <text x={x + w / 2} y={y + h / 2 + fs * 0.36} textAnchor="middle" fill="#fff" fontSize={fs} fontWeight="700" fontFamily="system-ui">PlatesOS</text>
  </g>
);

const Caption = ({ children, y = 224 }: { children: ReactNode; y?: number }) => (
  <text x="160" y={y} textAnchor="middle" fill="#8A7358" fontSize="9" fontWeight="600" fontFamily="system-ui" letterSpacing="1">{children}</text>
);

const SideFace = ({ x, y, h, qr = true }: { x: number; y: number; h: number; qr?: boolean }) => (
  <g transform={`translate(${x},${y}) skewY(9)`}>
    <rect width="26" height={h} rx="3" fill="#F8FAFC" stroke="#E2E8F0" />
    <g transform="translate(3,6) scale(0.29,1)"><rect width="68" height={h * 0.12} rx="4" fill="url(#pbrand)" /></g>
    {qr && <g transform={`translate(3,${h * 0.26}) scale(0.29,1)`}><QRPanel x={0} y={0} size={h * 0.46} /></g>}
    <g transform={`translate(3,${h - 14}) scale(0.29,1)`}><rect width="68" height="5" rx="2.5" fill="#CBD5E1" /></g>
  </g>
);

// ---------- 1. Cutlery & Condiment Caddy QR ----------
const Shaker = ({ x, y = 116, cap }: { x: number; y?: number; cap: string }) => (
  <g>
    <rect x={x} y={y} width="24" height="42" rx="7" fill="#fff" stroke="#CBD5E1" />
    <rect x={x + 4} y={y - 8} width="16" height="11" rx="4" fill={cap} />
    <circle cx={x + 12} cy={y + 22} r="6" fill="#E2E8F0" />
  </g>
);

const Cutlery = ({ x }: { x: number }) => (
  <g stroke="#B6C2D1" fill="#E4EAF2">
    {/* spoon */}
    <path d={`M${x} 150 v-48`} strokeWidth="4" strokeLinecap="round" />
    <ellipse cx={x} cy={98} rx="6.5" ry="9" />
    {/* fork */}
    <path d={`M${x + 20} 150 v-40`} strokeWidth="4" strokeLinecap="round" />
    <path d={`M${x + 20} 110 q-7 -2 -7 -10 v-10 M${x + 20} 110 q7 -2 7 -10 v-10`} strokeWidth="2.5" fill="none" />
    <path d={`M${x + 20} 100 v-10`} strokeWidth="2.5" fill="none" />
    {/* knife */}
    <path d={`M${x + 40} 150 v-38`} strokeWidth="4" strokeLinecap="round" />
    <path d={`M${x + 40} 112 q6 -6 6 -16 t-6 -8 z`} strokeWidth="2" />
  </g>
);

const Napkins = ({ x }: { x: number }) => (
  <g>
    <rect x={x} y="104" width="28" height="46" rx="3" fill="#fff" stroke="#CBD5E1" />
    <rect x={x + 3} y="100" width="28" height="46" rx="3" fill="#F8FAFC" stroke="#CBD5E1" />
    <path d={`M${x + 6} 112 h22 M${x + 6} 120 h22`} stroke="#E2E8F0" strokeWidth="2" />
  </g>
);

const Caddy = ({ x, w }: { x: number; w: number }) => (
  <g>
    <rect x={x} y="132" width={w} height="62" rx="10" fill="#fff" stroke="#CBD5E1" strokeWidth="2" />
    <rect x={x} y="132" width={w} height="10" rx="5" fill="#F1F5F9" />
  </g>
);

const CondimentArt = ({ view }: ArtProps) => {
  const side = view === "left" || view === "right";
  return (
    <TableScene label={`Cutlery and condiment caddy with QR panel, ${view} view`}>
      <Shadow cx={160} rx={side ? 46 : 80} />
      {side ? (
        <>
          <Flip on={view === "right"}>
            <Cutlery x={130} />
            <Shaker x={158} y={112} cap="#94A3B8" />
            <Caddy x={122} w={78} />
            <SideFace x={198} y={126} h={62} qr />
          </Flip>
          <text x="160" y="216" textAnchor="middle" fill="#8A7358" fontSize="9" fontWeight="700" fontFamily="system-ui">SLIM 90 mm FOOTPRINT</text>
        </>
      ) : view === "front" ? (
        <g>
          <Cutlery x={86} />
          <Shaker x={158} y={112} cap="#94A3B8" />
          <Shaker x={186} y={112} cap="#475569" />
          <Napkins x={216} />
          <Caddy x={68} w={184} />
          <path d="M150 142 v52 M206 142 v52" stroke="#E2E8F0" strokeWidth="2" />
          <Wordmark x={78} y={146} w={58} h={18} fs={10} />
          <text x="78" y="182" fill={BRAND.dark} fontSize="9" fontWeight="700" fontFamily="system-ui">SCAN TO ORDER</text>
          <QRPanel x={196} y={142} size={44} />
        </g>
      ) : (
        <g>
          <Cutlery x={86} />
          <Shaker x={158} y={112} cap="#475569" />
          <Shaker x={186} y={112} cap="#94A3B8" />
          <Napkins x={216} />
          <Caddy x={68} w={184} />
          <text x="160" y="162" textAnchor="middle" fill={BRAND.dark} fontSize="10" fontWeight="700" fontFamily="system-ui">Cutlery · Condiments · Napkins</text>
          <text x="160" y="180" textAnchor="middle" fill="#94A3B8" fontSize="8" fontWeight="600" fontFamily="system-ui">POWERED BY PLATESOS</text>
        </g>
      )}
    </TableScene>
  );
};

// ---------- 2. L-Shaped Table Tent QR ----------
const TableTentArt = ({ view }: ArtProps) => {
  const side = view === "left" || view === "right";
  return (
    <TableScene label={`L-shaped table tent, ${view} view`}>
      <Shadow cx={158} rx={side ? 48 : 62} />
      {side ? (
        <>
          <Flip on={view === "right"}>
            <path d="M150 184 L206 184 L220 192 L164 192 Z" fill="#E2E8F0" />
            <path d="M150 56 q0-8 8-8 h6 q8 0 8 8 v128 h-22 z" fill="#fff" stroke="#CBD5E1" strokeWidth="2" />
            <path d="M150 184 L206 184 L220 192 L164 192 Z" fill="#F1F5F9" stroke="#CBD5E1" strokeWidth="2" strokeLinejoin="round" />
            <SideFace x={172} y={50} h={128} />
          </Flip>
          <text x="160" y="212" textAnchor="middle" fill="#8A7358" fontSize="9" fontWeight="700" fontFamily="system-ui">SELF-STANDING L PROFILE</text>
        </>
      ) : (
        <g>
          <path d="M96 184 L224 184 L238 192 L110 192 Z" fill="#E2E8F0" />
          <path d="M110 184 L110 56 Q110 48 118 48 L214 48 Q222 48 222 56 L222 184 Z" fill="#fff" stroke="#CBD5E1" strokeWidth="2" />
          <path d="M110 184 L222 184 L236 192 L124 192 Z" fill="#F1F5F9" stroke="#CBD5E1" strokeWidth="2" strokeLinejoin="round" />
          {view === "front" ? (
            <>
              <Wordmark x={122} y={58} w={88} h={24} fs={13} />
              <QRPanel x={132} y={88} size={64} />
              <text x="166" y="166" textAnchor="middle" fill={BRAND.dark} fontSize="9" fontWeight="700" fontFamily="system-ui">TABLE 12</text>
              <text x="166" y="178" textAnchor="middle" fill="#64748B" fontSize="8" fontWeight="600" fontFamily="system-ui">SCAN TO ORDER</text>
            </>
          ) : (
            <>
              <text x="166" y="74" textAnchor="middle" fill={BRAND.dark} fontSize="12" fontWeight="700" fontFamily="system-ui">Table</text>
              <text x="166" y="112" textAnchor="middle" fill={BRAND.primary} fontSize="34" fontWeight="800" fontFamily="system-ui">12</text>
              <QRPanel x={144} y={114} size={42} />
              <text x="166" y="168" textAnchor="middle" fill="#94A3B8" fontSize="7.5" fontWeight="600" fontFamily="system-ui">SAME QR ON BOTH FACES</text>
            </>
          )}
        </g>
      )}
    </TableScene>
  );
};

// ---------- 3. Tissue Box QR Branding ----------
const TissueBoxArt = ({ view }: ArtProps) => {
  const side = view === "left" || view === "right";
  return (
    <TableScene label={`Branded tissue box, ${view} view`}>
      <Shadow cx={160} rx={side ? 56 : 76} />
      {side ? (
        <>
          <Flip on={view === "right"}>
            <path d="M150 66 q10 -18 22 -2 q10 -14 18 4 l-4 14 h-40 z" fill="#fff" stroke="#E2E8F0" />
            <path d="M112 84 L208 84 L208 186 L112 186 Z" fill="url(#pbrand)" opacity=".92" stroke="#CBD5E1" strokeWidth="2" />
            <path d="M112 84 L136 66 L232 66 L208 84 Z" fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="2" strokeLinejoin="round" />
            <path d="M208 84 L232 66 L232 168 L208 186 Z" fill="#fff" opacity=".9" stroke="#CBD5E1" strokeWidth="2" strokeLinejoin="round" />
            <ellipse cx="172" cy="75" rx="26" ry="6" fill="#E2E8F0" />
            <rect x="124" y="102" width="72" height="66" rx="8" fill="#fff" opacity=".95" />
          </Flip>
          <g>
            <QRPanel x={141} y={108} size={38} />
            <text x="160" y="160" textAnchor="middle" fill={BRAND.dark} fontSize="7" fontWeight="700" fontFamily="system-ui">SCAN TO ORDER</text>
          </g>
          <text x="160" y="212" textAnchor="middle" fill="#8A7358" fontSize="9" fontWeight="700" fontFamily="system-ui">BRANDED ON ALL FOUR SIDES</text>
        </>
      ) : (
        <g>
          <path d="M150 66 q10 -18 22 -2 q10 -14 18 4 l-4 14 h-40 z" fill="#fff" stroke="#E2E8F0" />
          <path d="M84 84 L236 84 L236 186 L84 186 Z" fill="#fff" stroke="#CBD5E1" strokeWidth="2" />
          <path d="M84 84 L108 66 L260 66 L236 84 Z" fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="2" strokeLinejoin="round" />
          <path d="M236 84 L260 66 L260 168 L236 186 Z" fill="url(#pbrand)" opacity=".9" stroke="#CBD5E1" strokeWidth="2" strokeLinejoin="round" />
          <ellipse cx="172" cy="75" rx="26" ry="6" fill="#E2E8F0" />
          {view === "front" ? (
            <>
              <Wordmark x={96} y={98} w={70} h={24} fs={12} />
              <text x="96" y="146" fill={BRAND.dark} fontSize="10" fontWeight="700" fontFamily="system-ui">Scan to order</text>
              <text x="96" y="160" fill="#64748B" fontSize="8" fontFamily="system-ui">No app needed</text>
              <QRPanel x={176} y={110} size={48} />
            </>
          ) : (
            <>
              <Wordmark x={125} y={104} w={70} h={24} fs={12} />
              <text x="160" y="150" textAnchor="middle" fill={BRAND.dark} fontSize="10" fontWeight="700" fontFamily="system-ui">Your logo here</text>
              <text x="160" y="164" textAnchor="middle" fill="#94A3B8" fontSize="8" fontFamily="system-ui">Full-colour print · 100 boxes min.</text>
            </>
          )}
        </g>
      )}
    </TableScene>
  );
};

const PRODUCTS = [
  { name: "Condiment Holder QR", Art: CondimentArt, tag: "Best seller",
    body: "One caddy for spoons, forks, salt, pepper and napkins — with your ordering QR printed on the front face.",
    message: "Hi PlatesOS! I'm interested in the Condiment Holder QR for my restaurant." },
  { name: "L-Shaped Table Tent QR", Art: TableTentArt, tag: "Table numbering",
    body: "Slim L-stand printed with your table number on both faces, so guests and servers always know the table.",
    message: "Hi PlatesOS! I'm interested in the L-Shaped Table Tent QR for my restaurant." },
  { name: "Tissue Box QR Branding", Art: TissueBoxArt, tag: "Everyday branding",
    body: "Custom-printed tissue boxes carrying your logo and ordering QR — useful on the table, seen at every meal.",
    message: "Hi PlatesOS! I'm interested in Tissue Box QR Branding for my restaurant." },
];

const ProductViewer = ({ p }: { p: (typeof PRODUCTS)[number] }) => {
  const t = useT();
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const [hover, setHover] = useState(false);
  const reduce = useReducedMotion();
  const go = (d: number) => { setDir(d); setI((n) => (n + d + VIEWS.length) % VIEWS.length); };
  const jump = (n: number) => { setDir(n > i ? 1 : -1); setI(n); };

  useEffect(() => {
    if (!hover || reduce) return;
    const t = setInterval(() => go(1), 1300);
    return () => clearInterval(t);
  }, [hover, reduce]);

  const view = VIEWS[i];
  return (
    <div className="relative aspect-[4/3] overflow-hidden bg-[#F2F7FF]"
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <AnimatePresence mode="popLayout" initial={false} custom={dir}>
        <motion.div key={view.id} className="absolute inset-0" custom={dir}
          initial={{ opacity: 0, x: dir * 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: dir * -40 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
          <p.Art view={view.id} />
        </motion.div>
      </AnimatePresence>

      <span className="absolute top-3 left-3 rounded-full bg-white/90 backdrop-blur px-2.5 py-1 text-[11px] font-semibold shadow-sm"
        style={{ color: BRAND.primary }}>{t(p.tag)}</span>
      <span className="absolute top-3 right-3 rounded-full bg-white/90 backdrop-blur px-2.5 py-1 text-[11px] font-medium text-slate-600 shadow-sm">
        {t(view.label)}
      </span>

      {[-1, 1].map((d) => (
        <button key={d} onClick={() => go(d)} aria-label={d < 0 ? `Previous view of ${p.name}` : `Next view of ${p.name}`}
          className={`absolute top-1/2 -translate-y-1/2 ${d < 0 ? "left-2" : "right-2"} h-8 w-8 rounded-full bg-white/90 shadow grid place-items-center opacity-100 sm:opacity-0 transition-opacity hover:bg-white focus-visible:opacity-100 group-hover:opacity-100`}
          style={{ color: BRAND.primary }}>
          {d < 0 ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      ))}

      <div className="absolute bottom-2.5 left-0 right-0 flex justify-center gap-1.5">
        {VIEWS.map((v, n) => (
          <button key={v.id} onClick={() => jump(n)} aria-label={`${v.label} view of ${p.name}`} aria-current={n === i}
            className="h-1.5 rounded-full transition-all" style={{ width: n === i ? 16 : 6, background: n === i ? BRAND.primary : "#C7D7EC" }} />
        ))}
      </div>
    </div>
  );
};

const ProductCard = ({ p }: { p: (typeof PRODUCTS)[number] }) => {
  const t = useT();
  const href = useSite().waLink(p.message);
  const cls = "mt-5 inline-flex items-center justify-center gap-2 rounded-xl border border-[#0B7BFF] bg-transparent py-2.5 text-sm font-semibold text-[#0B7BFF] transition-colors duration-300 group-hover:bg-[#0B7BFF] group-hover:text-white hover:bg-[#0B7BFF] hover:text-white";
  const label = <>{t("Get This for My Restaurant")} <ArrowRight className="h-4 w-4" /></>;
  return (
    <motion.div whileHover={{ y: -6 }} transition={{ type: "spring", stiffness: 300, damping: 22 }}
      className="group flex h-full flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white transition-shadow duration-300 hover:shadow-xl hover:shadow-blue-500/15">
      <ProductViewer p={p} />
      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-bold" style={{ color: BRAND.dark }}>{t(p.name)}</h3>
        <p className="mt-1.5 flex-1 text-sm text-slate-500">{t(p.body)}</p>
        {href
          ? <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>{label}</a>
          : <button type="button" onClick={() => scrollTo("contact")} className={cls}>{label}</button>}
      </div>
    </motion.div>
  );
};

const Products = () => {
  const t = useT();
  return (
    <section id="products" className="py-14 sm:py-20 scroll-mt-16" style={{ background: "#F8FAFF" }}>
      <div className="max-w-7xl mx-auto px-5 sm:px-6">
        <Reveal>
          <div className="text-center max-w-2xl mx-auto">
            <Pill>{t("On every table")}</Pill>
            <h2 className="mt-4 text-3xl md:text-4xl font-extrabold" style={{ color: BRAND.dark }}>
              {t("Premium QR products for")} <span style={{ color: BRAND.primary }}>{t("your tables")}</span>
            </h2>
            <p className="mt-4 text-slate-600">{t("Printed once, branded to your restaurant, and built to survive daily service. Every product links straight to your PlatesOS menu.")}</p>
          </div>
        </Reveal>
        <div className="mt-10 sm:mt-14 grid gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
          {PRODUCTS.map((p, i) => (
            <Reveal key={p.name} className="h-full" delay={(i % 3) * 0.08}><ProductCard p={p} /></Reveal>
          ))}
        </div>
        <Reveal delay={0.2}>
          <p className="mt-8 text-center text-sm text-slate-500">
            {t("Product images are indicative mockups — hover or tap the arrows to see all four sides. Custom sizes, colours and branding available on request.")}
          </p>
        </Reveal>
      </div>
    </section>
  );
};

// ====================
// WHY PLATESOS — rotating showcase
// ====================
const TablesSlide = () => {
  const st = ["busy", "free", "busy", "reserved", "busy", "busy", "free", "busy", "reserved", "busy", "free", "busy"];
  const style: Record<string, string> = { busy: "bg-blue-50 border-blue-300 text-blue-700", free: "bg-white border-slate-200 text-slate-400", reserved: "bg-amber-50 border-amber-300 text-amber-700" };
  return (
    <Tablet>
      <Sidebar active="Tables" />
      <div className="flex-1 p-3">
        <div className="flex justify-between mb-2"><span className="font-bold text-sm">Floor Plan</span><span className="text-slate-400">8 of 12 occupied</span></div>
        <div className="grid grid-cols-4 gap-2">
          {st.map((s, i) => (
            <div key={i} className={`rounded-lg border p-2 text-center ${style[s]}`}>
              <div className="font-bold">T{i + 1}</div><div className="capitalize">{s}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-3 text-slate-500">
          <span>● Busy</span><span className="text-amber-600">● Reserved</span><span className="text-slate-400">● Free</span>
        </div>
      </div>
    </Tablet>
  );
};

const PhoneCenter = ({ children }: { children: ReactNode }) => (
  <Phone_><div className="h-full grid place-items-center text-center p-3"><div className="w-full">{children}</div></div></Phone_>
);
const PhoneBadge = ({ icon: I }: { icon: typeof Check }) => (
  <div className="h-12 w-12 mx-auto rounded-full grid place-items-center text-white" style={{ background: BRAND.primary }}><I className="h-6 w-6" /></div>
);
const PhoneBtn = ({ t }: { t: string }) => (
  <div className="mt-3 rounded-md text-white py-1 px-3" style={{ background: BRAND.primary }}>{t}</div>
);

const PaymentPhone = () => (
  <PhoneCenter><PhoneBadge icon={Check} /><div className="mt-2 font-medium">Payment Successful</div><div className="text-sm font-bold">₹520</div><div className="text-slate-400">Paid via UPI</div><PhoneBtn t="View Order" /></PhoneCenter>
);
const BookingPhone = () => (
  <PhoneCenter><PhoneBadge icon={CalendarDays} /><div className="mt-2 font-medium">Table Booked</div><div className="text-sm font-bold">Sat, 8:00 PM</div><div className="text-slate-400">4 guests · Table 4</div><PhoneBtn t="Add to calendar" /></PhoneCenter>
);
const TrackPhone = () => (
  <PhoneCenter>
    <PhoneBadge icon={ShoppingCart} /><div className="mt-2 font-medium">Order #1042</div>
    <div className="mt-2 space-y-1 text-left">
      {[["Order placed", true], ["Preparing", true], ["Out for delivery", false]].map(([t, d]) => (
        <div key={t as string} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: d ? BRAND.primary : "#cbd5e1" }} /><span className={d ? "" : "text-slate-400"}>{t}</span></div>
      ))}
    </div>
    <PhoneBtn t="Track order" />
  </PhoneCenter>
);
const InvoicePhone = () => (
  <PhoneCenter>
    <PhoneBadge icon={FileText} /><div className="mt-2 font-medium">Invoice #INV-2291</div>
    <div className="mt-2 space-y-0.5 text-left">
      <div className="flex justify-between"><span>Subtotal</span><span>₹1,240</span></div>
      <div className="flex justify-between"><span>GST 5%</span><span>₹62</span></div>
      <div className="flex justify-between font-bold border-t pt-0.5"><span>Total</span><span>₹1,302</span></div>
    </div>
    <PhoneBtn t="Download PDF" />
  </PhoneCenter>
);

const WHY_SCENES = [
  { Screen: KitchenSlide, Phone: PaymentPhone, icon: Bell, title: "New Order", sub: "Table 3 · ₹520 · 3 items" },
  { Screen: TablesSlide, Phone: BookingPhone, icon: CalendarDays, title: "New Booking", sub: "4 guests · Sat 8:00 PM" },
  { Screen: OnlineSlide, Phone: TrackPhone, icon: ShoppingCart, title: "Online Order", sub: "#1042 · ₹640 · Delivery" },
  { Screen: AnalyticsSlide, Phone: InvoicePhone, icon: LineChart, title: "Daily Report Ready", sub: "Revenue up 12% today" },
];

const WhyShowcase = () => {
  const t = useT();
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setI((n) => (n + 1) % WHY_SCENES.length), 4000);
    return () => clearInterval(t);
  }, [paused]);
  const { Screen, Phone, icon: Icon, title, sub } = WHY_SCENES[i];
  const ease = [0.22, 1, 0.36, 1] as const;

  return (
    <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <FitScale w={560} h={400}>
        <div className="relative h-full w-full flex justify-center items-end">
          <AnimatePresence mode="wait">
            <motion.div key={i} className="relative flex items-end pt-14">
              <motion.div initial={{ opacity: 0, x: -30, scale: 0.97 }} animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 30, scale: 0.97 }} transition={{ duration: 0.5, ease }}>
                <Screen />
              </motion.div>
              <motion.div className="-ml-12 relative z-10"
                initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 24 }} exit={{ opacity: 0, y: 40 }}
                transition={{ duration: 0.5, delay: 0.15, ease }}>
                <Phone />
              </motion.div>
              <motion.div className="absolute top-0 right-0 z-20 rounded-xl bg-white shadow-xl p-3 flex items-center gap-3 text-sm"
                initial={{ opacity: 0, y: -12, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -12, scale: 0.9 }} transition={{ duration: 0.4, delay: 0.3, ease }}>
                <span className="h-9 w-9 rounded-full grid place-items-center text-white" style={{ background: BRAND.primary }}><Icon className="h-4 w-4" /></span>
                <div><div className="font-semibold">{t(title)}</div><div className="text-slate-500 text-xs">{sub}</div></div>
              </motion.div>
            </motion.div>
          </AnimatePresence>
        </div>
      </FitScale>
      <div className="mt-6 sm:mt-10 flex justify-center gap-1.5">
        {WHY_SCENES.map((s, n) => (
          <button key={s.title} aria-label={`Show ${s.title}`} onClick={() => setI(n)}
            className="h-2 rounded-full transition-all" style={{ width: n === i ? 22 : 8, background: n === i ? BRAND.primary : "#cbd5e1" }} />
        ))}
      </div>
    </div>
  );
};

// ====================
// WHY PLATESOS (ABOUT)
// ====================
const WhyPlatesOS = () => {
  const t = useT();
  return (
    <section id="about" className="py-14 sm:py-20 scroll-mt-16" style={{ background: "#F4F8FF" }}>
      <div className="max-w-7xl mx-auto px-5 sm:px-6 grid grid-cols-1 gap-8 sm:gap-10 lg:grid-cols-2 lg:gap-12 items-center">
        <Reveal>
          <Pill>{t("Why choose PlatesOS")}</Pill>
          <h2 className="mt-4 text-2xl sm:text-3xl md:text-4xl font-extrabold leading-tight" style={{ color: BRAND.dark }}>{t("Built for modern")}<br />
            {t("restaurants")}
          </h2>
          <p className="mt-4 text-sm sm:text-base text-slate-600 max-w-md leading-relaxed">{t("Simple to use, powerful behind the scenes, and designed to help you serve better, manage easier, and grow faster.")}</p>
          <ul className="mt-5 sm:mt-6 space-y-3">
            {["Easy setup & onboarding", "Dedicated support", "Scalable for single or multi-branch restaurants", "Trusted by modern food businesses"].map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm sm:text-base text-slate-700 leading-relaxed"><CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" style={{ color: BRAND.primary }} /> <span>{t(item)}</span></li>
            ))}
          </ul>
        </Reveal>
        <Reveal delay={0.1}>
          <WhyShowcase />
        </Reveal>
      </div>
    </section>
  );
};

// ====================
// PRICING
// ====================
const PLANS = [
  { name: "Starter", price: "₹999", desc: "For single-outlet cafés", perks: ["QR table ordering", "Online menu", "Basic reports", "Email support"] },
  { name: "Growth", price: "₹2,499", desc: "For busy restaurants", perks: ["Everything in Starter", "Online ordering website", "Kitchen display", "Table & booking management"], popular: true },
  { name: "Enterprise", price: "Custom", desc: "For chains & multi-branch", perks: ["Everything in Growth", "Multi-branch control", "Advanced analytics", "Dedicated manager"] },
];

const Pricing = () => {
  const t = useT();
  const site = useSite();
  return (
    <section id="pricing" className="py-14 sm:py-20 scroll-mt-16">
      <div className="max-w-6xl mx-auto px-5 sm:px-6">
        <Reveal>
          <div className="text-center">
            <Pill>{t("Simple pricing")}</Pill>
            <h2 className="mt-4 text-3xl md:text-4xl font-extrabold" style={{ color: BRAND.dark }}>{t("Plans that grow")} <span style={{ color: BRAND.primary }}>{t("with you")}</span></h2>
            <p className="mt-3 text-slate-600">{fillTokens(t("No commission on orders. {days}-day free trial on every plan."), site)}</p>
          </div>
        </Reveal>
        <div className="mt-10 sm:mt-12 grid gap-5 sm:gap-6 md:grid-cols-3">
          {PLANS.map((p, i) => (
            <Reveal key={p.name} delay={i * 0.08}>
              <div className={`relative rounded-2xl p-6 sm:p-7 h-full flex flex-col border ${p.popular ? "shadow-xl shadow-blue-500/15" : "bg-white"}`}
                style={p.popular ? { borderColor: BRAND.primary, background: "#fff" } : { borderColor: "#e2e8f0" }}>
                {p.popular && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-semibold text-white" style={{ background: BRAND.primary }}>{t("Most popular")}</span>}
                <div className="font-semibold" style={{ color: BRAND.dark }}>{t(p.name)}</div>
                <div className="text-sm text-slate-500">{t(p.desc)}</div>
                <div className="mt-4 text-4xl font-extrabold" style={{ color: BRAND.dark }}>{t(p.price)}<span className="text-sm font-normal text-slate-500">{p.price !== "Custom" && t("/month")}</span></div>
                <ul className="mt-6 space-y-2.5 flex-1">
                  {p.perks.map((k) => <li key={k} className="flex gap-2 text-sm text-slate-700"><Check className="h-4 w-4 mt-0.5" style={{ color: BRAND.primary }} />{t(k)}</li>)}
                </ul>
                <Link to="/auth" className="mt-6 text-center rounded-lg py-2.5 text-sm font-semibold transition"
                  style={p.popular ? { background: BRAND.primary, color: "#fff" } : { background: BRAND.soft, color: BRAND.primary }}>
                  {p.price === "Custom" ? t("Talk to sales") : t("Start free trial")}
                </Link>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
};

// ====================
// CONTACT
// ====================
type FormState = { name: string; email: string; phone: string; restaurant: string; subject: string; message: string };
const EMPTY: FormState = { name: "", email: "", phone: "", restaurant: "", subject: "", message: "" };

const SUBJECTS = ["Book a demo", "Pricing", "Support", "Partnership"];

const ContactSection = () => {
  const t = useT();
  const site = useSite();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [statusMsg, setStatusMsg] = useState("");

  const validate = () => {
    const e: typeof errors = {};
    if (!form.name.trim()) e.name = t("Name is required");
    if (!/^\S+@\S+\.\S+$/.test(form.email)) e.email = t("Enter a valid email");
    if (form.phone && !/^[+\d\s-]{7,15}$/.test(form.phone)) e.phone = t("Enter a valid phone");
    if (!form.subject) e.subject = t("Choose a subject");
    if (form.message.trim().length < 10) e.message = t("Message must be at least 10 characters");
    else if (form.message.length > 5000) e.message = t("Message must be under 5000 characters");
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setStatus("loading");
    // Insert-only for visitors: RLS lets anyone add a row but only a super
    // admin read them back, so no .select() here.
    const { error } = await supabase.from("contact_messages").insert({
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || null,
      restaurant: form.restaurant.trim() || null,
      subject: form.subject,
      message: form.message.trim(),
    });
    if (error) {
      console.error("Contact form submit failed", error);
      setStatus("error");
      setStatusMsg(site.email
        ? `${t("Couldn't send your message. Please try again.")} ${t("Or email us at")} ${site.email}.`
        : t("Couldn't send your message. Please try again."));
      return;
    }
    setStatus("success"); setStatusMsg(t("Thanks! We'll respond within 24 hours.")); setForm(EMPTY);
  };

  const field = (k: keyof FormState) => ({
    value: form[k],
    onChange: (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value }),
    className: `w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/30 ${errors[k] ? "border-rose-400" : "border-slate-200"}`,
  });
  const Err = ({ k }: { k: keyof FormState }) => errors[k] ? <p className="text-xs text-rose-500 mt-1">{errors[k]}</p> : null;
  const Label = ({ t, req }: { t: string; req?: boolean }) => <label className="text-xs font-medium text-slate-600 mb-1 block">{t}{req && <span className="text-rose-500"> *</span>}</label>;

  return (
    <section id="contact" className="py-14 sm:py-20 scroll-mt-16">
      <div className="max-w-7xl mx-auto px-5 sm:px-6 grid gap-8 sm:gap-10 md:grid-cols-2 lg:grid-cols-[1fr_0.9fr_1.4fr]">
        <Reveal>
          <Pill>{t("Get in touch")}</Pill>
          <h2 className="mt-4 text-3xl md:text-4xl font-extrabold" style={{ color: BRAND.dark }}>{t("Contact")} <span style={{ color: BRAND.primary }}>{t("Us")}</span></h2>
          <p className="mt-4 text-slate-600">{t("We'd love to hear from you! Whether you have a question, need support, or want to partner with us — we're here to help.")}</p>
        </Reveal>
        <Reveal delay={0.08}>
          <div className="space-y-5 sm:space-y-6">
            {[
              { icon: Mail, t: "Email", v: site.email, href: `mailto:${site.email}`, s: "We'll respond within 24 hours." },
              { icon: Phone, t: "Phone", v: site.phone, href: `tel:${site.phone.replace(/[^\d+]/g, "")}`, s: contactHours },
              { icon: MapPin, t: "Location", v: site.location, href: null, s: "(Remote support available)" },
            ].filter((c) => c.v).map((c) => (
              <div key={c.t} className="flex gap-3">
                <span className="h-10 w-10 shrink-0 rounded-lg grid place-items-center" style={{ background: BRAND.soft, color: BRAND.primary }}><c.icon className="h-5 w-5" /></span>
                <div>
                  <div className="font-semibold text-sm" style={{ color: BRAND.dark }}>{t(c.t)}</div>
                  {c.href
                    ? <a href={c.href} className="text-sm text-slate-700 hover:underline break-all">{c.v}</a>
                    : <div className="text-sm text-slate-700">{c.v}</div>}
                  <div className="text-xs text-slate-400">{t(c.s)}</div>
                </div>
              </div>
            ))}
          </div>
        </Reveal>
        <Reveal delay={0.16}>
          <form onSubmit={submit} noValidate className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-lg shadow-slate-200/50 space-y-4">
            <div className="font-semibold" style={{ color: BRAND.dark }}>{t("Send us a message")}</div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div><Label t={t("Full name")} req /><input {...field("name")} maxLength={120} placeholder={t("Your name")} /><Err k="name" /></div>
              <div><Label t={t("Email")} req /><input type="email" {...field("email")} maxLength={254} placeholder="you@example.com" /><Err k="email" /></div>
              <div><Label t={t("Phone")} /><input {...field("phone")} placeholder="+91 98765 43210" /><Err k="phone" /></div>
              <div><Label t={t("Restaurant name")} /><input {...field("restaurant")} maxLength={160} placeholder="Spice Garden" /></div>
            </div>
            <div><Label t={t("Subject")} req />
              <select {...field("subject")}>
                <option value="">{t("Select an option")}</option>
                {/* Value stays English so admins read one consistent subject, whatever the visitor's language */}
                {SUBJECTS.map((s) => <option key={s} value={s}>{t(s)}</option>)}
              </select><Err k="subject" />
            </div>
            <div><Label t={t("Message")} req /><textarea rows={4} {...field("message")} placeholder={t("How can we help you?")} /><Err k="message" /></div>
            <AnimatePresence>
              {(status === "success" || status === "error") && (
                <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="status"
                  className={`text-sm rounded-lg px-3 py-2 ${status === "success" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{statusMsg}</motion.p>
              )}
            </AnimatePresence>
            <button type="submit" disabled={status === "loading"}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold text-white disabled:opacity-70" style={{ background: BRAND.primary }}>
              {status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {status === "loading" ? t("Sending…") : t("Send message")}
            </button>
          </form>
        </Reveal>
      </div>
    </section>
  );
};

// ====================
// FINAL CTA
// ====================
const FinalCTA = () => {
  const t = useT();
  return (
    <section className="px-5 sm:px-6 pb-14 sm:pb-20">
      <Reveal>
        <div className="max-w-6xl mx-auto rounded-3xl p-8 sm:p-10 md:p-14 text-center text-white relative overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${BRAND.primary}, #0552C7)` }}>
          <h2 className="text-3xl md:text-4xl font-extrabold">{t("Ready to grow your restaurant?")}</h2>
          <p className="mt-3 text-blue-100">{t("Set up in minutes. No commission. Cancel anytime.")}</p>
          <Link to="/auth" className="mt-7 inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-semibold" style={{ color: BRAND.primary }}>
            {t("Start free trial")} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </Reveal>
    </section>
  );
};

// ====================
// FOOTER
// ====================
const Footer = () => {
  const t = useT();
  const socials = socialsFor(useSite());
  return (
    <footer className="border-t border-slate-100 bg-slate-50/60">
      <div className="max-w-7xl mx-auto px-5 sm:px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-6">
        <Logo />
        <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm text-slate-500">
          <a href="#" className="hover:text-slate-800">{t("Privacy Policy")}</a>
          <a href="#" className="hover:text-slate-800">{t("Terms of Service")}</a>
          <button onClick={() => scrollTo("contact")} className="hover:text-slate-800">{t("Contact")}</button>
        </div>
        {socials.length > 0 && (
          <div className="flex gap-3">
            {socials.map((s) => (
              <a key={s.key} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.name} className="h-7 w-7 hover:scale-110 transition"><s.Icon /></a>
            ))}
          </div>
        )}
      </div>
      <div className="text-center text-xs text-slate-400 pb-6">© {new Date().getFullYear()} {BRAND.name}. {t("All rights reserved.")}</div>
    </footer>
  );
};

// ====================
// AGENT KNOWLEDGE BASE  (every answer the bot can give)
// ====================
// Add, edit or remove entries freely — the bot lists them as tappable questions.
// c = topic it belongs to, q = the question as the bot shows it, a = the answer.
type FaqCategory = "Features" | "Pricing" | "Setup" | "Products" | "Support";

type Faq = { c: FaqCategory; q: string; a: string };

const FAQS: Faq[] = [
  // ---------- Features ----------
  {
    c: "Features",
    q: "What exactly does PlatesOS do?",
    a: "PlatesOS runs your day-to-day restaurant operations in one place — QR table ordering, online ordering, table bookings, kitchen tickets, billing, reports and invoices.",
  },
  {
    c: "Features",
    q: "How does QR table ordering work?",
    a: "Every table gets its own QR code. Guests scan, browse your live menu, order and pay from their phone, and the order reaches your kitchen with the table number already attached.",
  },
  {
    c: "Features",
    q: "Do my customers need to download an app?",
    a: "No. Guests scan the QR code and your menu opens in their phone's browser — there is nothing to download, install or sign up for.",
  },
  {
    c: "Features",
    q: "Can guests pay from their own phone?",
    a: "Yes. Guests can pay by UPI, card or wallet while ordering, or you can keep pay-at-counter on and collect at billing as usual.",
  },
  {
    c: "Features",
    q: "Which payment modes are supported?",
    a: "UPI, credit and debit cards, popular wallets, and cash at the counter — and every payment is tagged by mode in your reports.",
  },
  {
    c: "Features",
    q: "Can I update my menu and prices myself?",
    a: "Yes. Items, prices, photos, add-ons and out-of-stock toggles update instantly across every table QR code and your online ordering page.",
  },
  {
    c: "Features",
    q: "Can I take table bookings and reservations online?",
    a: "Yes. Guests can request a table from your page, and you confirm, move or cancel bookings on a live floor plan that shows which tables are free.",
  },
  {
    c: "Features",
    q: "Can I see live table status and a floor plan?",
    a: "Yes. The floor plan shows which tables are occupied, which have ordered and which are waiting to pay, updating as orders come in.",
  },
  {
    c: "Features",
    q: "Does PlatesOS handle delivery and takeaway orders?",
    a: "Yes. Your online ordering page accepts delivery and takeaway orders directly, with no commission taken on any of them.",
  },
  {
    c: "Features",
    q: "Does it print KOT tickets for the kitchen?",
    a: "Yes. Connect any standard thermal printer and each order prints as a KOT — or skip paper entirely and use the kitchen display screen instead.",
  },
  {
    c: "Features",
    q: "Can I run offers, coupons and discounts?",
    a: "Yes. Create percentage or flat-value coupons, happy-hour offers and item-level discounts, and switch them on or off whenever you like.",
  },
  {
    c: "Features",
    q: "Can I manage staff accounts and permissions?",
    a: "Yes. Add managers, cashiers and kitchen staff with role-based access, so each person only sees the screens they need.",
  },
  {
    c: "Features",
    q: "Can I track daily sales and best-selling items?",
    a: "Yes. The dashboard shows today's sales, order count and average bill value, along with your best-selling and slowest-moving items.",
  },
  {
    c: "Features",
    q: "Does it work for multiple outlets or branches?",
    a: "Yes. The Enterprise plan adds multi-branch control from a single login, with branch-level menus and pricing plus consolidated reporting across outlets.",
  },
  {
    c: "Features",
    q: "Do I get GST-ready invoices and reports?",
    a: "Yes. Every order produces a GST-ready invoice, and daily, item-wise and payment-mode reports can be viewed or exported at any time.",
  },
  {
    c: "Features",
    q: "Can I show my menu in more than one language?",
    a: "Yes. Item names and descriptions can be entered in the language your guests read, and this site itself is available in English, Hindi, Marathi and Kannada.",
  },
  {
    c: "Features",
    q: "Do I need special hardware to use PlatesOS?",
    a: "No. PlatesOS runs in any modern browser — on a phone, tablet, laptop or your existing billing computer. A thermal printer and a kitchen display screen are optional.",
  },
  {
    c: "Features",
    q: "What happens if my internet goes down?",
    a: "PlatesOS is cloud-based, so it needs a connection. Guests order over their own mobile data, so table ordering keeps working even when your Wi-Fi drops — keep a backup hotspot for billing.",
  },

  // ---------- Pricing ----------
  {
    c: "Pricing",
    q: "How much does PlatesOS cost?",
    a: "Starter is ₹999 a month and Growth is ₹2,499 a month, both billed flat with no commission. Enterprise is priced to your chain — talk to sales for a quote.",
  },
  {
    c: "Pricing",
    q: "Do you charge commission on orders?",
    a: "Never. You keep 100% of every order value and pay only a flat monthly plan fee, no matter how many orders you take.",
  },
  {
    c: "Pricing",
    q: "Is there a free trial?",
    a: "Yes — a {days}-day free trial on every plan. You can explore the full product first and cancel any time before the trial ends.",
  },
  {
    c: "Pricing",
    q: "Which plan should I start with?",
    a: "Starter fits a single-outlet café, Growth fits a busy restaurant that needs online ordering and a kitchen display, and Enterprise fits chains and multi-branch operations.",
  },
  {
    c: "Pricing",
    q: "Are there any setup or hidden fees?",
    a: "No setup fee and no hidden charges — your plan price is what you pay. Printed QR table products are the only separate, optional cost.",
  },
  {
    c: "Pricing",
    q: "How can I pay for my subscription?",
    a: "UPI, credit or debit card, net banking and bank transfer are all accepted, and you get a GST invoice for every payment.",
  },
  {
    c: "Pricing",
    q: "What is your refund and cancellation policy?",
    a: "The {days}-day trial means you only pay once you're sure. After that you can cancel any time and you won't be billed from the next cycle — write to support for anything specific to your account.",
  },
  {
    c: "Pricing",
    q: "Is there a discount for annual billing or multiple outlets?",
    a: "Yes — annual plans and multi-outlet accounts are priced lower per outlet. Tell us your outlet count and we'll share a quote.",
  },
  {
    c: "Pricing",
    q: "Can I change or cancel my plan later?",
    a: "Yes. Upgrade, downgrade or cancel from your dashboard whenever you like — changes take effect from your next billing cycle.",
  },

  // ---------- Setup ----------
  {
    c: "Setup",
    q: "How long does setup take?",
    a: "Most restaurants go live the same day. Once your menu is in, your table QR codes and ordering page are generated straight away.",
  },
  {
    c: "Setup",
    q: "Can I try PlatesOS before paying?",
    a: "Yes. Start a {days}-day free trial with no card details, set up your real menu, and decide at the end of it.",
  },
  {
    c: "Setup",
    q: "Can I book a demo with your team?",
    a: "Yes. Pick “Book a demo” in the contact form or message us on WhatsApp, and we'll walk you through the product on a call at a time that suits you.",
  },
  {
    c: "Setup",
    q: "Do you help with menu upload and onboarding?",
    a: "Yes. Share your existing menu in any format — PDF, Excel or even photos — and our team sets it up and walks your staff through the basics.",
  },
  {
    c: "Setup",
    q: "Do you train my staff on the system?",
    a: "Yes. We run a short walkthrough for your managers and kitchen staff, and leave you with simple guides they can refer back to.",
  },
  {
    c: "Setup",
    q: "How do I get my table QR codes printed?",
    a: "Download print-ready QR PDFs from your dashboard and use any local printer, or order our printed table tents, tissue boxes and condiment caddies.",
  },
  {
    c: "Setup",
    q: "Can I keep my current POS or billing software?",
    a: "In most cases yes — PlatesOS can run alongside your billing system while orders flow in digitally. Tell us what you use and we'll confirm before you commit.",
  },

  // ---------- Products ----------
  {
    c: "Products",
    q: "What QR table products do you supply?",
    a: "Table tents, tissue-box holders and condiment-caddy wraps, each printed with your branding and a QR code mapped to a specific table.",
  },
  {
    c: "Products",
    q: "Is the printing customised to my brand?",
    a: "Yes. Your logo, colours and a short call-to-action go on every piece, and you approve a digital proof before anything goes to print.",
  },
  {
    c: "Products",
    q: "How do I order QR table products?",
    a: "Pick a product in the Products section above, tell us your table count, and we'll send a quote with pricing and delivery timelines.",
  },

  // ---------- Support ----------
  {
    c: "Support",
    q: "How do I reach your support team?",
    a: "Email {email} and we respond within 24 hours, or call {phone} between Mon – Fri, 9:00 AM – 6:00 PM. WhatsApp works too.",
  },
  {
    c: "Support",
    q: "How quickly do you reply to support requests?",
    a: "Email gets a reply within 24 hours, and WhatsApp or phone is usually answered within the same working hour, Mon – Fri, 9:00 AM – 6:00 PM.",
  },
  {
    c: "Support",
    q: "Which languages is PlatesOS available in?",
    a: "The platform and this site are available in English, Hindi, Marathi and Kannada, and support is available in all four.",
  },
  {
    c: "Support",
    q: "Where are you based?",
    a: "We're based in {location}, and remote support is available across the country — so your location is never a problem.",
  },
  {
    c: "Support",
    q: "Is my restaurant's data safe?",
    a: "Your data stays yours. It is stored on encrypted servers, access is limited by staff role, and you can export or request deletion of your data at any time.",
  },
];

// ---- the bot's browse helpers (tap-only: no typing anywhere) ----
const FAQ_CATEGORIES: FaqCategory[] = ["Features", "Pricing", "Setup", "Products", "Support"];

// Offered first, before any topic is picked. Each must match a question above exactly.
const FAQ_POPULAR = [
  "How much does PlatesOS cost?",
  "Do you charge commission on orders?",
  "Is there a free trial?",
  "Do my customers need to download an app?",
  "How do I reach your support team?",
];

const faqIn = (c: FaqCategory) => FAQS.filter((f) => f.c === c);
const faqFor = (q: string) => FAQS.find((f) => f.q === q);

// Handover message — always English so your team reads one consistent format.
const buildAskMessage = (asked: Faq[]) =>
  asked.length
    ? [
        "Hi PlatesOS! I read these answers on your site:",
        ...asked.map((f) => `• ${f.q}`),
        "",
        "I'd like to know more.",
      ].join("\n")
    : whatsappChatMessage;

// ====================
// FLOATING PLATESOS AGENT (robot launcher + panel)
// ====================
const AgentAvatar = () => {
  const reduce = useReducedMotion();
  const loop = (t: TargetAndTransition) => (reduce ? undefined : t);
  const fillBox = { transformBox: "fill-box" as const };
  return (
    <motion.svg viewBox="0 0 120 120" className="h-full w-full drop-shadow-xl" aria-hidden="true"
      animate={loop({ y: [0, -4, 0] })} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}>
      <defs>
        <radialGradient id="ag-head" cx="35%" cy="30%" r="80%"><stop offset="0" stopColor="#FFFFFF" /><stop offset="1" stopColor="#CFE2FF" /></radialGradient>
        <linearGradient id="ag-body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4DA3FF" /><stop offset="1" stopColor="#0B7BFF" /></linearGradient>
        <linearGradient id="ag-visor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1E3A8A" /><stop offset="1" stopColor="#0B1B3F" /></linearGradient>
        <radialGradient id="ag-glow"><stop offset="0" stopColor="#9FD0FF" /><stop offset="1" stopColor="#0B7BFF" /></radialGradient>
      </defs>
      <ellipse cx="60" cy="114" rx="26" ry="4" fill="#0B1B3F" opacity=".12" />
      {/* body */}
      <rect x="38" y="80" width="44" height="30" rx="14" fill="url(#ag-body)" />
      <rect x="50" y="88" width="20" height="10" rx="5" fill="#fff" opacity=".9" />
      <circle cx="55" cy="93" r="2" fill="#25D366" /><circle cx="61" cy="93" r="2" fill="#0B7BFF" /><circle cx="67" cy="93" r="2" fill="#FFB020" />
      {/* left arm */}
      <rect x="28" y="84" width="12" height="20" rx="6" fill="url(#ag-body)" />
      {/* antenna */}
      <line x1="60" y1="28" x2="60" y2="14" stroke="#94A3B8" strokeWidth="3" strokeLinecap="round" />
      <motion.circle cx="60" cy="11" r="5" fill="url(#ag-glow)" style={{ ...fillBox, transformOrigin: "center" }}
        animate={loop({ scale: [1, 1.25, 1], opacity: [1, 0.75, 1] })} transition={{ duration: 1.8, repeat: Infinity }} />
      {/* ears */}
      <rect x="20" y="46" width="10" height="20" rx="5" fill="url(#ag-body)" />
      <rect x="90" y="46" width="10" height="20" rx="5" fill="url(#ag-body)" />
      {/* head */}
      <rect x="26" y="26" width="68" height="58" rx="26" fill="url(#ag-head)" stroke="#BFDBFE" strokeWidth="1.5" />
      <ellipse cx="44" cy="36" rx="10" ry="5" fill="#fff" opacity=".8" />
      {/* visor + face */}
      <rect x="35" y="42" width="50" height="30" rx="15" fill="url(#ag-visor)" />
      {[50, 70].map((cx) => (
        <motion.ellipse key={cx} cx={cx} cy="55" rx="4.5" ry="5.5" fill="#7CE7FF" style={{ ...fillBox, transformOrigin: "center" }}
          animate={loop({ scaleY: [1, 1, 0.1, 1] })} transition={{ duration: 4, times: [0, 0.9, 0.95, 1], repeat: Infinity }} />
      ))}
      <path d="M53 63 Q60 68 67 63" stroke="#7CE7FF" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <ellipse cx="41" cy="66" rx="3" ry="2" fill="#FF8FB1" opacity=".7" />
      <ellipse cx="79" cy="66" rx="3" ry="2" fill="#FF8FB1" opacity=".7" />
      {/* waving right arm */}
      <motion.g style={{ transformBox: "view-box", transformOrigin: "80px 92px" }}
        animate={loop({ rotate: [0, 18, -4, 18, 0] })} transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 1.4, ease: "easeInOut" }}>
        <line x1="80" y1="92" x2="101" y2="72" stroke="url(#ag-body)" strokeWidth="11" strokeLinecap="round" />
        <circle cx="103" cy="69" r="7" fill="url(#ag-head)" stroke="#BFDBFE" />
      </motion.g>
    </motion.svg>
  );
};

const AGENT_COPY = {
  title: "Hi! I'm the PlatesOS Agent 👋",
  body: "Want to know more about our platform? Chat with us.",
};

type PanelProps = { touch: boolean; onClose: () => void };

const CloseBtn = ({ onClose, className = "", light = false }: { onClose: () => void; className?: string; light?: boolean }) => (
  <button onClick={onClose} aria-label="Close"
    className={`${light ? "text-white/80 hover:text-white" : "text-slate-400 hover:text-slate-600"} ${className}`}>
    <X className="h-4 w-4" />
  </button>
);

const ChatButton = ({ small = false, className = "", message = whatsappChatMessage, label = "Chat with us" }:
  { small?: boolean; className?: string; message?: string; label?: string }) => {
  const t = useT();
  const href = useSite().waLink(message);
  if (!href) return null;
  return (
    <motion.a href={href} target="_blank" rel="noopener noreferrer" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
      className={`inline-flex items-center justify-center gap-2 bg-[#25D366] font-semibold text-white shadow-lg shadow-green-600/25 hover:brightness-95 ${
        small ? "rounded-full px-3.5 py-1.5 text-xs" : "w-full rounded-xl py-2.5 text-sm"} ${className}`}>
      <span className={`${small ? "h-4 w-4" : "h-5 w-5"} overflow-hidden rounded`}><WhatsAppIcon /></span>
      {t(label)}
    </motion.a>
  );
};

const OnlineStatus = ({ label = "Online · replies fast" }: { label?: string }) => {
  const t = useT();
  return (
    <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-600">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      {t(label)}
    </div>
  );
};

const panelMotion = {
  initial: { opacity: 0, y: 16, scale: 0.9 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 12, scale: 0.95 },
  transition: { type: "spring" as const, stiffness: 320, damping: 24 },
  style: { transformOrigin: "bottom right" },
};

// Shared gradient header for the chat-style panels
const AgentHeader = ({ typing, touch, onClose }: { typing: boolean; touch: boolean; onClose: () => void }) => {
  const t = useT();
  return (
    <div className="flex items-center gap-3 px-4 py-3 text-white" style={{ background: `linear-gradient(135deg, #3D9BFF, ${BRAND.primary})` }}>
      <div className="h-11 w-11 shrink-0 rounded-full bg-white/20 p-0.5"><AgentAvatar /></div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm">{t("PlatesOS Agent")}</div>
        <div className="flex items-center gap-1.5 text-[11px] text-white/90">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />{typing ? t("typing…") : t("Online · replies fast")}
        </div>
      </div>
      {touch && <CloseBtn onClose={onClose} light />}
    </div>
  );
};

// ---- Style 1: CARD (robot peeking over a card) ----
const CardPanel = ({ touch, onClose }: PanelProps) => {
  const t = useT();
  return (
    <motion.div {...panelMotion} id="platesos-agent" role="dialog" aria-label="PlatesOS Agent"
      className="relative w-[300px] max-w-[calc(100vw-2.5rem)]">
      <motion.div className="absolute -top-10 left-3 z-10 h-24 w-24"
        initial={{ y: 24, opacity: 0, rotate: -10 }} animate={{ y: 0, opacity: 1, rotate: 0 }}
        transition={{ delay: 0.1, type: "spring", stiffness: 260, damping: 15 }}>
        <AgentAvatar />
      </motion.div>
      <div className="relative rounded-2xl bg-white/95 backdrop-blur border border-slate-100 shadow-2xl shadow-slate-900/15 p-5">
        {touch && <CloseBtn onClose={onClose} className="absolute top-3 right-3" />}
        <div className="pl-24 min-h-[2.75rem]">
          <div className="font-bold text-sm" style={{ color: BRAND.dark }}>{t("PlatesOS Agent")}</div>
          <div className="mt-0.5"><OnlineStatus /></div>
        </div>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="mt-3 rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-sm" style={{ background: BRAND.soft, color: BRAND.dark }}>
          <p className="font-semibold">{t(AGENT_COPY.title)}</p>
          <p className="mt-0.5 text-slate-600">{t(AGENT_COPY.body)}</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="mt-4">
          <ChatButton />
        </motion.div>
        <span className="absolute -bottom-2 right-5 h-4 w-4 rotate-45 bg-white border-r border-b border-slate-100" />
      </div>
    </motion.div>
  );
};

// ---- Style 2: CHAT PREVIEW (typing dots → messages → quick replies) ----
const TypingDots = () => (
  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
    className="inline-flex gap-1 rounded-2xl rounded-tl-sm bg-white px-3.5 py-3 shadow-sm" aria-label="Agent is typing">
    {[0, 1, 2].map((i) => (
      <motion.span key={i} className="h-1.5 w-1.5 rounded-full bg-slate-400"
        animate={{ y: [0, -4, 0] }} transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }} />
    ))}
  </motion.div>
);

const Bubble = ({ children }: { children: ReactNode }) => (
  <motion.div initial={{ opacity: 0, y: 8, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
    transition={{ type: "spring", stiffness: 320, damping: 22 }} style={{ transformOrigin: "top left", color: BRAND.dark }}
    className="w-fit max-w-[88%] rounded-2xl rounded-tl-sm bg-white px-3.5 py-2 text-sm shadow-sm">
    {children}
  </motion.div>
);

const UserBubble = ({ children }: { children: ReactNode }) => (
  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
    className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-tr-sm px-3.5 py-2 text-sm text-white shadow-sm"
    style={{ background: BRAND.primary }}>
    {children}
  </motion.div>
);

const ChatPanel = ({ touch, onClose }: PanelProps) => {
  const t = useT();
  const { waLink } = useSite();
  const reduce = useReducedMotion();
  const [step, setStep] = useState(reduce ? 3 : 0);
  useEffect(() => {
    if (reduce) return;
    const ts = [900, 1700, 2200].map((ms, i) => window.setTimeout(() => setStep(i + 1), ms));
    return () => ts.forEach(clearTimeout);
  }, [reduce]);
  const typing = step < 2;

  return (
    <motion.div {...panelMotion} id="platesos-agent" role="dialog" aria-label="PlatesOS Agent"
      className="w-[320px] max-w-[calc(100vw-2.5rem)] overflow-hidden rounded-2xl bg-white border border-slate-100 shadow-2xl shadow-slate-900/20">
      <AgentHeader typing={typing} touch={touch} onClose={onClose} />

      <div className="space-y-2 px-4 py-4 min-h-[190px]" style={{ background: "#F4F8FF" }} aria-live="polite">
        {step >= 1 && <Bubble><span className="font-semibold">{t(AGENT_COPY.title)}</span></Bubble>}
        {step >= 2 && <Bubble>{t(AGENT_COPY.body)}</Bubble>}
        <AnimatePresence>{typing && <TypingDots key={`t${step}`} />}</AnimatePresence>
        {step >= 3 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {waLink(whatsappChatMessage) && agentQuickReplies.map((q, i) => (
              <motion.a key={q.label} href={waLink(q.message) ?? undefined} target="_blank" rel="noopener noreferrer"
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
                className="rounded-full border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium hover:bg-[#EAF3FF] transition-colors"
                style={{ color: BRAND.primary }}>
                {t(q.label)}
              </motion.a>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-slate-100 p-3"><ChatButton /></div>
    </motion.div>
  );
};

// ---- Style 5: GUIDED (auto questions → tap options → WhatsApp with summary) ----
// Edit FLOW to change questions. Each option's `next` is another step id or FLOW_END.
type FlowOption = { label: string; next: string };
type FlowStep = { question: string; options: FlowOption[] };
type Answer = { stepId: string; label: string };

const FLOW_START = "start";
const FLOW_END = "done";
const FLOW_ASK = "ask"; // typed question → answered from the knowledge base above

const FLOW: Record<string, FlowStep> = {
  start: {
    question: "What can I help you with today?",
    options: [
      { label: "💬 Ask a question", next: FLOW_ASK },
      { label: "💰 Pricing & plans", next: "outlets" },
      { label: "📅 Book a demo", next: "outlets" },
      { label: "🪧 QR table products", next: "product" },
      { label: "🛠️ Support", next: "support" },
    ],
  },
  outlets: {
    question: "How many outlets do you run?",
    options: [
      { label: "1 outlet", next: "business" },
      { label: "2–5 outlets", next: "business" },
      { label: "6+ outlets", next: "business" },
    ],
  },
  business: {
    question: "What type of business is it?",
    options: [
      { label: "Café", next: "feature" },
      { label: "Restaurant", next: "feature" },
      { label: "Cloud kitchen", next: "feature" },
      { label: "QSR / Fast food", next: "feature" },
    ],
  },
  feature: {
    question: "Which feature matters most to you?",
    options: [
      { label: "QR table ordering", next: FLOW_END },
      { label: "Online ordering", next: FLOW_END },
      { label: "Table bookings", next: FLOW_END },
      { label: "Kitchen & reports", next: FLOW_END },
    ],
  },
  product: {
    question: "Which product are you interested in?",
    options: [
      { label: "Condiment Holder QR", next: "tables" },
      { label: "L-Shaped Table Tent QR", next: "tables" },
      { label: "Tissue Box QR Branding", next: "tables" },
      { label: "Not sure yet", next: "tables" },
    ],
  },
  tables: {
    question: "Roughly how many tables do you have?",
    options: [
      { label: "Under 10", next: FLOW_END },
      { label: "10–25", next: FLOW_END },
      { label: "25–50", next: FLOW_END },
      { label: "50+", next: FLOW_END },
    ],
  },
  support: {
    question: "What is the issue about?",
    options: [
      { label: "Login / account", next: FLOW_END },
      { label: "Orders or payments", next: FLOW_END },
      { label: "QR or menu setup", next: FLOW_END },
      { label: "Something else", next: FLOW_END },
    ],
  },
};

// Always sent in English so your team reads a consistent format
const buildFlowMessage = (answers: Answer[]) =>
  ["Hi PlatesOS! Here are my details:", ...answers.map((a) => `• ${FLOW[a.stepId].question} → ${a.label}`)].join("\n");

const GuidedPanel = ({ touch, onClose }: PanelProps) => {
  const t = useT();
  const site = useSite();
  const reduce = useReducedMotion();
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [stepId, setStepId] = useState(FLOW_START);
  const [typing, setTyping] = useState(!reduce);
  const scrollRef = useRef<HTMLDivElement>(null);

  // --- question mode: tap a topic, tap a question, read the answer ---
  const [topic, setTopic] = useState<FaqCategory | null>(null);
  const [asked, setAsked] = useState<Faq[]>([]);
  const [thinking, setThinking] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const asking = stepId === FLOW_ASK;
  const done = stepId === FLOW_END;
  const step = FLOW[stepId];

  // Short "typing…" pause before each new question
  useEffect(() => {
    if (reduce) { setTyping(false); return; }
    setTyping(true);
    const id = window.setTimeout(() => setTyping(false), 650);
    return () => window.clearTimeout(id);
  }, [stepId, reduce]);

  // Keep the latest message in view (scrolls the panel only, not the page)
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }, [answers, asked, typing, thinking, reduce]);

  const choose = (o: FlowOption) => {
    setAnswers((a) => [...a, { stepId, label: o.label }]);
    setStepId(o.next);
  };
  const resetAsk = () => { setTopic(null); setAsked([]); setThinking(false); };
  const back = () => {
    const last = answers[answers.length - 1];
    if (!last) return;
    setAnswers(answers.slice(0, -1));
    setStepId(last.stepId);
    resetAsk();
  };
  const restart = () => { setAnswers([]); setStepId(FLOW_START); resetAsk(); };

  // Answer a tapped question straight from the knowledge base.
  const answer = (f: Faq) => {
    setAsked((prev) => [...prev, f]);
    setTopic(f.c);
    if (reduce) return;
    setThinking(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setThinking(false), 550);
  };

  const Chip = ({ label, onClick }: { label: string; onClick: () => void }) => (
    <motion.button type="button" onClick={onClick} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-blue-200 bg-white px-3 py-1.5 text-left text-xs font-medium hover:bg-[#EAF3FF] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
      style={{ color: BRAND.primary }}>
      {label}
    </motion.button>
  );

  const Group = ({ title, children }: { title: string; children: ReactNode }) => (
    <div>
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</div>
      <div className="flex flex-col items-start gap-2">{children}</div>
    </div>
  );

  const unread = (list: Faq[]) => list.filter((f) => !asked.includes(f) && !faqMissing(f.a, site));

  return (
    <motion.div {...panelMotion} id="platesos-agent" role="dialog" aria-label="PlatesOS Agent"
      className="w-[340px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl bg-white border border-slate-100 shadow-2xl shadow-slate-900/20">
      <AgentHeader typing={typing || thinking} touch={touch} onClose={onClose} />

      <div ref={scrollRef} aria-live="polite"
        className="max-h-[min(360px,55vh)] overflow-y-auto overscroll-contain space-y-2 px-4 py-4" style={{ background: "#F4F8FF" }}>
        <Bubble><span className="font-semibold">{t(AGENT_COPY.title)}</span></Bubble>
        {answers.map((a, i) => (
          <div key={i} className="space-y-2">
            <Bubble>{t(FLOW[a.stepId].question)}</Bubble>
            <UserBubble>{t(a.label)}</UserBubble>
          </div>
        ))}

        {asking ? (
          <>
            <Bubble>{t("Pick a topic, or tap a popular question.")}</Bubble>

            {asked.map((f, i) => {
              const hide = i === asked.length - 1 && thinking; // hold the reply while the dots show
              return (
                <div key={f.q} className="space-y-2">
                  <UserBubble>{t(f.q)}</UserBubble>
                  {!hide && <Bubble>{fillTokens(t(f.a), site)}</Bubble>}
                </div>
              );
            })}

            {thinking ? (
              <TypingDots />
            ) : (
              <div className="space-y-3 pt-1">
                {topic === null ? (
                  <>
                    <Group title={t("Popular")}>
                      {unread(FAQ_POPULAR.map((q) => faqFor(q)).filter((f): f is Faq => !!f)).map((f) => (
                        <Chip key={f.q} label={t(f.q)} onClick={() => answer(f)} />
                      ))}
                    </Group>
                    <Group title={t("Browse by topic")}>
                      <div className="flex flex-wrap gap-2">
                        {FAQ_CATEGORIES.map((c) => (
                          <Chip key={c} label={t(c)} onClick={() => setTopic(c)} />
                        ))}
                      </div>
                    </Group>
                  </>
                ) : (
                  <>
                    {unread(faqIn(topic)).length > 0 && (
                      <Group title={t(topic)}>
                        {unread(faqIn(topic)).slice(0, 6).map((f) => (
                          <Chip key={f.q} label={t(f.q)} onClick={() => answer(f)} />
                        ))}
                      </Group>
                    )}
                    <Chip label={`← ${t("Other topics")}`} onClick={() => setTopic(null)} />
                  </>
                )}
              </div>
            )}
          </>
        ) : typing ? (
          <TypingDots />
        ) : done ? (
          <Bubble>{t("Thanks! Tap below to continue on WhatsApp — our team will reply shortly.")}</Bubble>
        ) : (
          <>
            <Bubble>{t(step.question)}</Bubble>
            <div className="flex flex-wrap gap-2 pt-1">
              {step.options.map((o, i) => (
                <motion.button key={o.label} type="button" onClick={() => choose(o)}
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                  className="rounded-full border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium hover:bg-[#EAF3FF] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                  style={{ color: BRAND.primary }}>
                  {t(o.label)}
                </motion.button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="border-t border-slate-100 p-3 space-y-2">
        {asking && asked.length > 0 && <ChatButton message={buildAskMessage(asked)} label="Chat with our team" />}
        {done && !typing && <ChatButton message={buildFlowMessage(answers)} label="Continue on WhatsApp" />}
        <div className="flex justify-between text-xs text-slate-500">
          <button type="button" onClick={back} disabled={!answers.length} className="hover:text-slate-800 disabled:opacity-40">
            ← {t("Back")}
          </button>
          <button type="button" onClick={restart} disabled={!answers.length} className="hover:text-slate-800 disabled:opacity-40">
            {t("Start over")}
          </button>
        </div>
      </div>
    </motion.div>
  );
};

// ---- Style 3: PEEK-OUT (robot pops up from behind the button + comic bubble) ----
const PeekPanel = ({ touch, onClose }: PanelProps) => {
  const t = useT();
  return (
    <motion.div id="platesos-agent" role="dialog" aria-label="PlatesOS Agent"
      className="relative flex items-end gap-2 -mb-6 -mr-5"
      initial={{ opacity: 1 }} animate={{ opacity: 1 }} exit={{ opacity: 1 }}>
      <motion.div initial={{ opacity: 0, scale: 0.6, x: 20 }} animate={{ opacity: 1, scale: 1, x: 0 }}
        exit={{ opacity: 0, scale: 0.8, x: 10, transition: { duration: 0.15 } }}
        transition={{ delay: 0.2, type: "spring", stiffness: 300, damping: 18 }}
        style={{ transformOrigin: "right bottom", borderColor: BRAND.dark, boxShadow: `4px 4px 0 ${BRAND.dark}` }}
        className="relative mb-12 w-[230px] max-w-[calc(100vw-8.5rem)] rounded-2xl border-2 bg-white p-3.5">
        {touch && <CloseBtn onClose={onClose} className="absolute top-2 right-2" />}
        <p className="pr-4 text-sm font-extrabold" style={{ color: BRAND.dark }}>{t(AGENT_COPY.title)}</p>
        <p className="mt-1 text-[13px] text-slate-600">{t(AGENT_COPY.body)}</p>
        <ChatButton small className="mt-3" />
        <span className="absolute -right-[9px] bottom-6 h-4 w-4 rotate-45 border-t-2 border-r-2 bg-white" style={{ borderColor: BRAND.dark }} />
      </motion.div>
      <motion.div className="h-24 w-24 shrink-0"
        initial={{ y: 70, scale: 0.4, rotate: 20 }} animate={{ y: 0, scale: 1, rotate: 0 }}
        exit={{ y: 70, scale: 0.4, rotate: 20, transition: { duration: 0.25 } }}
        transition={{ type: "spring", stiffness: 280, damping: 15 }}>
        <AgentAvatar />
      </motion.div>
    </motion.div>
  );
};

// ---- Style 4: PILL (button stretches sideways) ----
const PillPanel = (_props: PanelProps) => {
  const t = useT();
  return (
    <motion.div id="platesos-agent" role="dialog" aria-label="PlatesOS Agent"
      initial={{ width: 0, opacity: 0 }} animate={{ width: "auto", opacity: 1 }} exit={{ width: 0, opacity: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 28 }}
      className="overflow-hidden max-w-[calc(100vw-7rem)]">
      <div className="flex items-center gap-3 whitespace-nowrap pl-1 pr-3">
        <div className="h-11 w-11 shrink-0 rounded-full p-0.5" style={{ background: BRAND.soft }}><AgentAvatar /></div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold" style={{ color: BRAND.dark }}>{t(AGENT_COPY.title)}</p>
          <p className="truncate text-xs text-slate-500">{t("Want to know more about our platform?")}</p>
        </div>
        <ChatButton small className="shrink-0" />
      </div>
    </motion.div>
  );
};

const AGENT_PANELS: Record<AgentStyle, ComponentType<PanelProps>> = {
  card: CardPanel, chat: ChatPanel, peek: PeekPanel, pill: PillPanel, guided: GuidedPanel,
};

// ---- Container: hover (desktop) / tap (mobile); "guided" is always click-to-open ----
// The floating launcher is the PlatesOS Agent robot itself — it bobs, waves and
// blinks (all motion is dropped automatically when the visitor prefers reduced motion).
const AgentFloat = () => {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [touch, setTouch] = useState(false);
  const [style, setStyle] = useState<AgentStyle>(AGENT_STYLE);
  const rootRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);

  // Guided chat must stay open while the visitor taps through, so it never uses hover
  const clickMode = touch || style === "guided";

  useEffect(() => {
    setTouch(window.matchMedia("(hover: none)").matches);
    // Preview any style with ?agent=card | chat | peek | pill | guided
    const q = new URLSearchParams(window.location.search).get("agent");
    if (q && q in AGENT_PANELS) setStyle(q as AgentStyle);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("keydown", onKey);
    if (clickMode) document.addEventListener("pointerdown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDown); };
  }, [open, clickMode]);

  const show = () => { window.clearTimeout(closeTimer.current); setOpen(true); };
  const hide = () => { closeTimer.current = window.setTimeout(() => setOpen(false), 250); };
  const close = () => setOpen(false);

  const Panel = AGENT_PANELS[style];
  const isPill = style === "pill";

  const launcher = (
    <motion.div className="relative z-10 shrink-0" initial={{ scale: 0, y: 24, opacity: 0 }}
      animate={{ scale: 1, y: 0, opacity: 1 }}
      transition={{ delay: 0.9, type: "spring", stiffness: 240, damping: 16 }}>
      {/* soft halo, only while closed */}
      {!open && (
        <>
          <span className="pointer-events-none absolute inset-0 rounded-full bg-[#0B7BFF] opacity-20 animate-ping" />
          <span className="pointer-events-none absolute -inset-1 rounded-full bg-[#0B7BFF]/10 blur-md" />
        </>
      )}
      <motion.button type="button" onClick={() => setOpen(!open)}
        aria-expanded={open} aria-controls="platesos-agent"
        aria-label={open ? "Close PlatesOS Agent" : "Open PlatesOS Agent"}
        className="relative grid h-16 w-16 sm:h-[72px] sm:w-[72px] place-items-center rounded-full bg-white ring-1 ring-blue-100 shadow-xl shadow-blue-600/25 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300"
        whileHover={{ scale: 1.07 }} whileTap={{ scale: 0.94 }}
        animate={reduce || open ? { y: 0 } : { y: [0, -6, 0] }}
        transition={{ duration: 3.2, repeat: reduce || open ? 0 : Infinity, ease: "easeInOut" }}>
        <AnimatePresence mode="wait" initial={false}>
          {open ? (
            <motion.span key="x" initial={{ rotate: -90, opacity: 0, scale: 0.6 }} animate={{ rotate: 0, opacity: 1, scale: 1 }}
              exit={{ rotate: 90, opacity: 0, scale: 0.6 }} className="grid h-11 w-11 place-items-center rounded-full text-white"
              style={{ background: BRAND.primary }}>
              <X className="h-5 w-5" />
            </motion.span>
          ) : (
            <motion.span key="bot" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }}
              className="h-[58px] w-[58px] sm:h-[66px] sm:w-[66px]">
              <AgentAvatar />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </motion.div>
  );

  return (
    <div ref={rootRef} className="fixed z-[90] right-4 sm:right-5"
      style={{ bottom: "calc(1rem + env(safe-area-inset-bottom))" }}
      onMouseEnter={clickMode ? undefined : show} onMouseLeave={clickMode ? undefined : hide}
      onFocus={clickMode ? undefined : show}
      onBlur={clickMode ? undefined : (e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) hide(); }}>
      {isPill ? (
        <div className={`flex items-center rounded-full transition-[background-color,box-shadow] duration-300 ${
          open ? "bg-white p-1.5 -m-1.5 shadow-2xl shadow-slate-900/20 ring-1 ring-slate-100" : ""}`}>
          <AnimatePresence>{open && <Panel key="pill" touch={clickMode} onClose={close} />}</AnimatePresence>
          {launcher}
        </div>
      ) : (
        <div className="flex flex-col items-end gap-4">
          <AnimatePresence>{open && <Panel key={style} touch={clickMode} onClose={close} />}</AnimatePresence>
          {launcher}
        </div>
      )}
    </div>
  );
};

// ====================
// MAIN APP
// ====================
function PlatesOS() {
  // Language resets to English on every load/refresh (nothing is persisted)
  const [lang, setLang] = useState<Lang>("en");
  const settings = Route.useLoaderData();
  const site = useMemo(() => buildSite(settings), [settings]);

  // Always open at the top on load/refresh (browsers otherwise restore the old scroll position)
  useEffect(() => {
    if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
    if (window.location.hash) window.history.replaceState(null, "", window.location.pathname + window.location.search);
    window.scrollTo(0, 0);
  }, []);

  return (
    <LangCtx.Provider value={{ lang, setLang }}>
      <SiteCtx.Provider value={site}>
        <div className="min-h-screen bg-white text-slate-900 antialiased [scroll-behavior:smooth]" lang={lang}>
          <Navbar />
          <main>
            <Hero />
            <Features />
            <Products />
            <WhyPlatesOS />
            <Pricing />
            <ContactSection />
            <FinalCTA />
          </main>
          <Footer />
          <AgentFloat />
        </div>
      </SiteCtx.Provider>
    </LangCtx.Provider>
  );
}