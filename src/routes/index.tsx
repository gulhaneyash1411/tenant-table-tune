import { createFileRoute, Link } from "@tanstack/react-router";
import { createContext, useContext, useEffect, useRef, useState, type ComponentType, type FormEvent, type ReactNode } from "react";
import { motion, AnimatePresence, useReducedMotion, type TargetAndTransition } from "framer-motion";
import {
  Utensils, Zap, ArrowRight, PlayCircle, Check, CheckCircle2, ChevronLeft, ChevronRight,
  ShoppingCart, QrCode, CalendarDays, LineChart, FileText, Percent,
  Mail, Phone, MapPin, Send, Bell, LayoutDashboard, ChefHat, BarChart3, Loader2, X, Globe, ChevronDown,
} from "lucide-react";

export const Route = createFileRoute("/")({ component: PlatesOS });

// ====================
// PLATESOS CONFIG
// ====================
const BRAND = { name: "PlatesOS", primary: "#0B7BFF", dark: "#0B1B3F", soft: "#EAF3FF" };

const socialLinks = {
  instagram: "https://instagram.com/platesos",
  facebook: "https://facebook.com/platesos",
  whatsapp: "https://wa.me/919876543210",
  linkedin: "https://linkedin.com/company/platesos",
};

const contactInfo = {
  email: "support@platesos.com",
  phone: "+91 98765 43210",
  hours: "Mon – Fri, 9:00 AM – 6:00 PM",
  location: "Bengaluru, Karnataka, India",
};

// Floating WhatsApp chat: number in international format (no +, spaces or dashes)
const whatsappChat = {
  number: "919876543210",
  message: "Hi PlatesOS! I'd like to know more about your restaurant management platform.",
};
const waLink = (msg: string) => `https://wa.me/${whatsappChat.number}?text=${encodeURIComponent(msg)}`;
const whatsappChatUrl = waLink(whatsappChat.message);

// PlatesOS Agent look: "card" | "chat" | "peek" | "pill"
type AgentStyle = "card" | "chat" | "peek" | "pill";
const AGENT_STYLE: AgentStyle = "card";

// Quick replies (used by the "chat" style)
const agentQuickReplies = [
  { label: "💰 Pricing", message: "Hi PlatesOS! Can you share your pricing plans?" },
  { label: "📅 Book a demo", message: "Hi PlatesOS! I'd like to book a demo." },
  { label: "📱 QR ordering", message: "Hi PlatesOS! Tell me more about QR table ordering." },
];

// Demo video: a YouTube link or a file path (e.g. "/videos/platesos-demo.mp4" in /public)
const DEMO_VIDEO_URL = "https://www.youtube.com/watch?v=YOUR_VIDEO_ID";

// Set to your API/email endpoint when ready. While null, the form reports an honest error.
const CONTACT_ENDPOINT: string | null = null;

const NAV = [
  { id: "home", label: "Home" },
  { id: "features", label: "Features" },
  { id: "products", label: "Products" },
  { id: "pricing", label: "Pricing" },
  { id: "about", label: "About" },
  { id: "contact", label: "Contact" },
];

const scrollTo = (id: string) =>
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

// ====================
// LANGUAGE / i18n
// ====================
type Lang = "en" | "hi" | "mr";
const LANGS: { id: Lang; label: string; short: string }[] = [
  { id: "en", label: "English", short: "EN" },
  { id: "hi", label: "हिंदी", short: "हि" },
  { id: "mr", label: "मराठी", short: "मर" },
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
    "No commission": "कोई कमीशन नहीं", "14-day free trial": "14 दिन का फ्री ट्रायल", "Easy setup": "आसान सेटअप",
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
    "No commission on orders. 14-day free trial on every plan.": "ऑर्डर पर कोई कमीशन नहीं। हर प्लान पर 14 दिन का फ्री ट्रायल।",
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
  },
  mr: {
    "Home": "होम", "Features": "वैशिष्ट्ये", "Products": "प्रॉडक्ट्स", "Pricing": "किंमत",
    "About": "आमच्याविषयी", "Contact": "संपर्क", "Sign in": "साइन इन", "Get started": "सुरू करा",
    "Modern Restaurant Management Platform": "आधुनिक रेस्टॉरंट मॅनेजमेंट प्लॅटफॉर्म",
    "Run Your Restaurant.": "तुमचं रेस्टॉरंट चालवा.", "Smarter.": "अधिक स्मार्टपणे.",
    "One powerful platform to manage orders, tables, bookings, QR ordering, and daily operations — all in one place.":
      "ऑर्डर, टेबल, बुकिंग, QR ऑर्डरिंग आणि रोजचं कामकाज — सर्व काही एकाच सशक्त प्लॅटफॉर्मवर.",
    "Start free trial": "मोफत ट्रायल सुरू करा", "Watch video": "व्हिडिओ पाहा",
    "No commission": "कमिशन नाही", "14-day free trial": "14 दिवस मोफत ट्रायल", "Easy setup": "सोपा सेटअप",
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
    "No commission on orders. 14-day free trial on every plan.": "ऑर्डरवर कमिशन नाही. प्रत्येक प्लॅनवर 14 दिवस मोफत ट्रायल.",
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
    "Ready to grow your restaurant?": "तुमचं रेस्टॉरंट वाढवायला तयार?",
    "Set up in minutes. No commission. Cancel anytime.": "काही मिनिटांत सेटअप. कमिशन नाही. कधीही रद्द करा.",
    "Privacy Policy": "प्रायव्हसी पॉलिसी", "Terms of Service": "सेवा अटी", "All rights reserved.": "सर्व हक्क राखीव.",
    "PlatesOS Agent": "PlatesOS एजंट", "Online · replies fast": "ऑनलाइन · लवकर उत्तर", "typing…": "टाइप करत आहे…",
    "Hi! I'm the PlatesOS Agent 👋": "नमस्कार! मी PlatesOS एजंट आहे 👋",
    "Want to know more about our platform? Chat with us.": "आमच्या प्लॅटफॉर्मबद्दल अधिक जाणून घ्यायचंय? आमच्याशी चॅट करा.",
    "Want to know more about our platform?": "आमच्या प्लॅटफॉर्मबद्दल अधिक जाणून घ्यायचंय?",
    "Chat with us": "आमच्याशी चॅट करा", "💰 Pricing": "💰 किंमत", "📅 Book a demo": "📅 डेमो बुक करा", "📱 QR ordering": "📱 QR ऑर्डरिंग",
    "Language": "भाषा",
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
const Logo = () => (
  <button onClick={() => scrollTo("home")} className="flex items-center gap-2">
    <span className="h-9 w-9 rounded-xl grid place-items-center text-white" style={{ background: BRAND.primary }}>
      <Utensils className="h-5 w-5" />
    </span>
    <span className="text-xl font-bold" style={{ color: BRAND.dark }}>
      Plates<span style={{ color: BRAND.primary }}>OS</span>
    </span>
  </button>
);

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

const SOCIALS = [
  { key: "instagram", name: "Instagram", handle: "@platesos", href: socialLinks.instagram, Icon: InstagramIcon },
  { key: "facebook", name: "Facebook", handle: "@platesos", href: socialLinks.facebook, Icon: FacebookIcon },
  { key: "whatsapp", name: "WhatsApp", handle: contactInfo.phone, href: socialLinks.whatsapp, Icon: WhatsAppIcon },
  { key: "linkedin", name: "LinkedIn", handle: "@platesos", href: socialLinks.linkedin, Icon: LinkedInIcon },
];

// ====================
// NAVBAR
// ====================
const Navbar = () => {
  const t = useT();
  const [active, setActive] = useState("home");
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
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
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
        <div className="flex items-center gap-3">
          <Link to="/auth" className="text-sm text-slate-700 hover:text-slate-900">{t("Sign in")}</Link>
          <Link to="/auth" className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white"
            style={{ background: BRAND.primary }}>
            {t("Get started")} <ArrowRight className="h-4 w-4" />
          </Link>
          <LanguageMenu />
        </div>
      </div>
    </header>
  );
};

// ====================
// PRODUCT CAROUSEL — slide mockups
// ====================
const Tablet = ({ children }: { children: ReactNode }) => (
  <div className="rounded-[28px] bg-slate-900 p-3 shadow-2xl shadow-slate-900/30 w-[440px] max-w-full">
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
      <div className="relative h-[330px] grid place-items-center overflow-hidden">
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
        <motion.div className="fixed inset-0 z-[100] grid place-items-center p-4 bg-slate-950/80 backdrop-blur-sm"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
          role="dialog" aria-modal="true" aria-label="PlatesOS demo video">
          <motion.div className="relative w-full max-w-4xl" onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.92, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
            <button onClick={onClose} autoFocus aria-label="Close video"
              className="absolute -top-12 right-0 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white grid place-items-center transition">
              <X className="h-5 w-5" />
            </button>
            <div className="aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-2xl">
              {embed ? (
                <iframe src={embed} title="PlatesOS demo" className="h-full w-full"
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
              ) : (
                <video src={DEMO_VIDEO_URL} className="h-full w-full" autoPlay controls playsInline />
              )}
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
  const [videoOpen, setVideoOpen] = useState(false);
  return (
  <section id="home" className="relative overflow-hidden scroll-mt-16">
    <div className="absolute inset-0 -z-10" style={{ background: `radial-gradient(ellipse at 80% 0%, ${BRAND.soft}, transparent 60%), linear-gradient(180deg,#fff, #F6F9FF)` }} />
    <div className="max-w-7xl mx-auto px-6 py-16 lg:py-20 grid lg:grid-cols-[1fr_1.15fr] gap-10 items-center">
      <Reveal>
        <Pill>{t("Modern Restaurant Management Platform")}</Pill>
        <h1 className="mt-5 text-[2.6rem] sm:text-5xl lg:text-[3.5rem] font-extrabold tracking-tight leading-[1.08]" style={{ color: BRAND.dark }}>
          <span className="block whitespace-nowrap">{t("Run Your Restaurant.")}</span>
          <span className="block" style={{ color: BRAND.primary }}>{t("Smarter.")}</span>
        </h1>
        <p className="mt-5 text-lg text-slate-600 max-w-md">
          {t("One powerful platform to manage orders, tables, bookings, QR ordering, and daily operations — all in one place.")}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <PrimaryBtn to="/auth">{t("Start free trial")} <ArrowRight className="h-4 w-4" /></PrimaryBtn>
          <button onClick={() => setVideoOpen(true)} className="inline-flex items-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold bg-white border border-slate-200 shadow-sm hover:bg-slate-50" style={{ color: BRAND.dark }}>
            <PlayCircle className="h-4 w-4" style={{ color: BRAND.primary }} /> {t("Watch video")}
          </button>
        </div>
        <div className="mt-6 flex flex-wrap gap-5 text-sm text-slate-500">
          {["No commission", "14-day free trial", "Easy setup"].map((label) => (
            <span key={label} className="flex items-center gap-1.5"><Check className="h-4 w-4" style={{ color: BRAND.primary }} />{t(label)}</span>
          ))}
        </div>
      </Reveal>
      <ProductCarousel />
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
    className="group relative h-full min-h-[240px] overflow-hidden rounded-3xl p-7 bg-white border border-slate-200 hover:border-transparent hover:shadow-xl hover:shadow-blue-500/25 transition-[box-shadow,border-color] duration-300">
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
  <section id="features" className="py-20 scroll-mt-16">
    <div className="max-w-7xl mx-auto px-6">
      <Reveal>
        <div className="text-center max-w-2xl mx-auto">
          <Pill>{t("Everything you need")}</Pill>
          <h2 className="mt-4 text-3xl md:text-4xl font-extrabold" style={{ color: BRAND.dark }}>
            {t("Powerful features for")} <span style={{ color: BRAND.primary }}>{t("your restaurant")}</span>
          </h2>
          <p className="mt-4 text-slate-600">{t("From online orders to detailed reports, PlatesOS gives you the tools to run your restaurant smoothly and efficiently.")}</p>
        </div>
      </Reveal>
      <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
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
              <QRPanel x={132} y={90} size={68} />
              <text x="166" y="172" textAnchor="middle" fill={BRAND.dark} fontSize="10" fontWeight="600" fontFamily="system-ui">TABLE 12 · SCAN TO ORDER</text>
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
          <g transform={view === "right" ? "translate(36,0)" : undefined}>
            <QRPanel x={132} y={108} size={38} />
            <text x="151" y="160" textAnchor="middle" fill={BRAND.dark} fontSize="7" fontWeight="700" fontFamily="system-ui">SCAN TO ORDER</text>
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
    const t = setInterval(() => go(1), 2200);
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
          className={`absolute top-1/2 -translate-y-1/2 ${d < 0 ? "left-2" : "right-2"} h-8 w-8 rounded-full bg-white/90 shadow grid place-items-center opacity-0 transition-opacity hover:bg-white focus-visible:opacity-100 group-hover:opacity-100`}
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
  return (
  <motion.div whileHover={{ y: -6 }} transition={{ type: "spring", stiffness: 300, damping: 22 }}
    className="group flex h-full flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white transition-shadow duration-300 hover:shadow-xl hover:shadow-blue-500/15">
    <ProductViewer p={p} />
    <div className="flex flex-1 flex-col p-5">
      <h3 className="font-bold" style={{ color: BRAND.dark }}>{t(p.name)}</h3>
      <p className="mt-1.5 flex-1 text-sm text-slate-500">{t(p.body)}</p>
      <a href={waLink(p.message)} target="_blank" rel="noopener noreferrer"
        className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl border border-[#0B7BFF] bg-transparent py-2.5 text-sm font-semibold text-[#0B7BFF] transition-colors duration-300 group-hover:bg-[#0B7BFF] group-hover:text-white hover:bg-[#0B7BFF] hover:text-white">
        {t("Get This for My Restaurant")} <ArrowRight className="h-4 w-4" />
      </a>
    </div>
  </motion.div>
  );
};

const Products = () => {
  const t = useT();
  return (
  <section id="products" className="py-20 scroll-mt-16" style={{ background: "#F8FAFF" }}>
    <div className="max-w-7xl mx-auto px-6">
      <Reveal>
        <div className="text-center max-w-2xl mx-auto">
          <Pill>{t("On every table")}</Pill>
          <h2 className="mt-4 text-3xl md:text-4xl font-extrabold" style={{ color: BRAND.dark }}>
            {t("Premium QR products for")} <span style={{ color: BRAND.primary }}>{t("your tables")}</span>
          </h2>
          <p className="mt-4 text-slate-600">{t("Printed once, branded to your restaurant, and built to survive daily service. Every product links straight to your PlatesOS menu.")}</p>
        </div>
      </Reveal>
      <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
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
      <div className="relative h-[400px] flex justify-center items-end">
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
      <div className="mt-10 flex justify-center gap-1.5">
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
  <section id="about" className="py-20 scroll-mt-16" style={{ background: "#F4F8FF" }}>
    <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-12 items-center">
      <Reveal>
        <Pill>{t("Why choose PlatesOS")}</Pill>
        <h2 className="mt-4 text-3xl md:text-4xl font-extrabold" style={{ color: BRAND.dark }}>{t("Built for modern")}<br />{t("restaurants")}</h2>
        <p className="mt-4 text-slate-600 max-w-md">{t("Simple to use, powerful behind the scenes, and designed to help you serve better, manage easier, and grow faster.")}</p>
        <ul className="mt-6 space-y-3">
          {["Easy setup & onboarding", "Dedicated support", "Scalable for single or multi-branch restaurants", "Trusted by modern food businesses"].map((item) => (
            <li key={item} className="flex items-center gap-2 text-slate-700"><CheckCircle2 className="h-5 w-5" style={{ color: BRAND.primary }} />{t(item)}</li>
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
  return (
  <section id="pricing" className="py-20 scroll-mt-16">
    <div className="max-w-6xl mx-auto px-6">
      <Reveal>
        <div className="text-center">
          <Pill>{t("Simple pricing")}</Pill>
          <h2 className="mt-4 text-3xl md:text-4xl font-extrabold" style={{ color: BRAND.dark }}>{t("Plans that grow")} <span style={{ color: BRAND.primary }}>{t("with you")}</span></h2>
          <p className="mt-3 text-slate-600">{t("No commission on orders. 14-day free trial on every plan.")}</p>
        </div>
      </Reveal>
      <div className="mt-12 grid md:grid-cols-3 gap-6">
        {PLANS.map((p, i) => (
          <Reveal key={p.name} delay={i * 0.08}>
            <div className={`relative rounded-2xl p-7 h-full flex flex-col border ${p.popular ? "shadow-xl shadow-blue-500/15" : "bg-white"}`}
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

const ContactSection = () => {
  const t = useT();
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
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setStatus("loading");
    try {
      if (!CONTACT_ENDPOINT) throw new Error(`Messaging isn't connected yet. Please email us at ${contactInfo.email}.`);
      const res = await fetch(CONTACT_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) throw new Error("Couldn't send your message. Please try again.");
      setStatus("success"); setStatusMsg("Thanks! We'll respond within 24 hours."); setForm(EMPTY);
    } catch (err) {
      setStatus("error"); setStatusMsg((err as Error).message);
    }
  };

  const field = (k: keyof FormState) => ({
    value: form[k],
    onChange: (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value }),
    className: `w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/30 ${errors[k] ? "border-rose-400" : "border-slate-200"}`,
  });
  const Err = ({ k }: { k: keyof FormState }) => errors[k] ? <p className="text-xs text-rose-500 mt-1">{errors[k]}</p> : null;
  const Label = ({ t, req }: { t: string; req?: boolean }) => <label className="text-xs font-medium text-slate-600 mb-1 block">{t}{req && <span className="text-rose-500"> *</span>}</label>;

  return (
    <section id="contact" className="py-20 scroll-mt-16">
      <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-[1fr_0.9fr_1.4fr] gap-10">
        <Reveal>
          <Pill>{t("Get in touch")}</Pill>
          <h2 className="mt-4 text-3xl md:text-4xl font-extrabold" style={{ color: BRAND.dark }}>{t("Contact")} <span style={{ color: BRAND.primary }}>{t("Us")}</span></h2>
          <p className="mt-4 text-slate-600">{t("We'd love to hear from you! Whether you have a question, need support, or want to partner with us — we're here to help.")}</p>
        </Reveal>
        <Reveal delay={0.08}>
          <div className="space-y-6">
            {[
              { icon: Mail, t: "Email", v: contactInfo.email, s: "We'll respond within 24 hours." },
              { icon: Phone, t: "Phone", v: contactInfo.phone, s: contactInfo.hours },
              { icon: MapPin, t: "Location", v: contactInfo.location, s: "(Remote support available)" },
            ].map((c) => (
              <div key={c.t} className="flex gap-3">
                <span className="h-10 w-10 shrink-0 rounded-lg grid place-items-center" style={{ background: BRAND.soft, color: BRAND.primary }}><c.icon className="h-5 w-5" /></span>
                <div><div className="font-semibold text-sm" style={{ color: BRAND.dark }}>{t(c.t)}</div><div className="text-sm text-slate-700">{c.v}</div><div className="text-xs text-slate-400">{t(c.s)}</div></div>
              </div>
            ))}
          </div>
        </Reveal>
        <Reveal delay={0.16}>
          <form onSubmit={submit} noValidate className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50 space-y-4">
            <div className="font-semibold" style={{ color: BRAND.dark }}>{t("Send us a message")}</div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div><Label t={t("Full name")} req /><input {...field("name")} placeholder={t("Your name")} /><Err k="name" /></div>
              <div><Label t={t("Email")} req /><input type="email" {...field("email")} placeholder="you@example.com" /><Err k="email" /></div>
              <div><Label t={t("Phone")} /><input {...field("phone")} placeholder="+91 98765 43210" /><Err k="phone" /></div>
              <div><Label t={t("Restaurant name")} /><input {...field("restaurant")} placeholder="Spice Garden" /></div>
            </div>
            <div><Label t={t("Subject")} req />
              <select {...field("subject")}>
                <option value="">{t("Select an option")}</option>
                <option>{t("Book a demo")}</option><option>{t("Pricing")}</option><option>{t("Support")}</option><option>{t("Partnership")}</option>
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
  <section className="px-6 pb-20">
    <Reveal>
      <div className="max-w-6xl mx-auto rounded-3xl p-10 md:p-14 text-center text-white relative overflow-hidden"
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
  return (
  <footer className="border-t border-slate-100 bg-slate-50/60">
    <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-6">
      <Logo />
      <div className="flex gap-8 text-sm text-slate-500">
        <a href="#" className="hover:text-slate-800">{t("Privacy Policy")}</a>
        <a href="#" className="hover:text-slate-800">{t("Terms of Service")}</a>
        <button onClick={() => scrollTo("contact")} className="hover:text-slate-800">{t("Contact")}</button>
      </div>
      <div className="flex gap-3">
        {SOCIALS.map((s) => (
          <a key={s.key} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.name} className="h-7 w-7 hover:scale-110 transition"><s.Icon /></a>
        ))}
      </div>
    </div>
    <div className="text-center text-xs text-slate-400 pb-6">© {new Date().getFullYear()} PlatesOS. {t("All rights reserved.")}</div>
  </footer>
  );
};

// ====================
// FLOATING WHATSAPP + PLATESOS AGENT
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

const ChatButton = ({ small = false, className = "" }: { small?: boolean; className?: string }) => {
  const t = useT();
  return (
  <motion.a href={whatsappChatUrl} target="_blank" rel="noopener noreferrer" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
    className={`inline-flex items-center justify-center gap-2 bg-[#25D366] font-semibold text-white shadow-lg shadow-green-600/25 hover:brightness-95 ${
      small ? "rounded-full px-3.5 py-1.5 text-xs" : "w-full rounded-xl py-2.5 text-sm"} ${className}`}>
    <span className={`${small ? "h-4 w-4" : "h-5 w-5"} overflow-hidden rounded`}><WhatsAppIcon /></span>
    {t("Chat with us")}
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

const ChatPanel = ({ touch, onClose }: PanelProps) => {
  const t = useT();
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

      <div className="space-y-2 px-4 py-4 min-h-[190px]" style={{ background: "#F4F8FF" }} aria-live="polite">
        {step >= 1 && <Bubble><span className="font-semibold">{t(AGENT_COPY.title)}</span></Bubble>}
        {step >= 2 && <Bubble>{t(AGENT_COPY.body)}</Bubble>}
        <AnimatePresence>{typing && <TypingDots key={`t${step}`} />}</AnimatePresence>
        {step >= 3 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {agentQuickReplies.map((q, i) => (
              <motion.a key={q.label} href={waLink(q.message)} target="_blank" rel="noopener noreferrer"
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
  card: CardPanel, chat: ChatPanel, peek: PeekPanel, pill: PillPanel,
};

// ---- Container: hover (desktop) / tap (mobile) ----
const WhatsAppFloat = () => {
  const [open, setOpen] = useState(false);
  const [touch, setTouch] = useState(false);
  const [style, setStyle] = useState<AgentStyle>(AGENT_STYLE);
  const rootRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    setTouch(window.matchMedia("(hover: none)").matches);
    // Preview any style with ?agent=card | chat | peek | pill
    const q = new URLSearchParams(window.location.search).get("agent");
    if (q && q in AGENT_PANELS) setStyle(q as AgentStyle);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("keydown", onKey);
    if (touch) document.addEventListener("pointerdown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDown); };
  }, [open, touch]);

  const show = () => { window.clearTimeout(closeTimer.current); setOpen(true); };
  const hide = () => { closeTimer.current = window.setTimeout(() => setOpen(false), 250); };
  const close = () => setOpen(false);

  const Panel = AGENT_PANELS[style];
  const isPill = style === "pill";

  const fabClass = "relative h-14 w-14 rounded-full bg-[#25D366] shadow-lg shadow-green-600/40 grid place-items-center focus:outline-none focus-visible:ring-4 focus-visible:ring-green-300";
  const fabInner = (
    <>
      {!open && <span className="absolute inset-0 rounded-full bg-[#25D366] animate-ping opacity-30" />}
      <AnimatePresence mode="wait" initial={false}>
        {touch && open ? (
          <motion.span key="x" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} className="relative text-white">
            <X className="h-6 w-6" />
          </motion.span>
        ) : (
          <motion.span key="wa" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} className="relative h-9 w-9 overflow-hidden rounded-full">
            <WhatsAppIcon />
          </motion.span>
        )}
      </AnimatePresence>
    </>
  );

  const fab = (
    <motion.div className="relative z-10 shrink-0" initial={{ scale: 0 }} animate={{ scale: 1 }}
      transition={{ delay: 1, type: "spring", stiffness: 260, damping: 18 }} whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.95 }}>
      {touch ? (
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="platesos-agent"
          aria-label={open ? "Close PlatesOS Agent" : "Open PlatesOS Agent"} className={fabClass}>{fabInner}</button>
      ) : (
        <a href={whatsappChatUrl} target="_blank" rel="noopener noreferrer" aria-label="Chat with us on WhatsApp"
          aria-describedby={open ? "platesos-agent" : undefined} className={fabClass}>{fabInner}</a>
      )}
    </motion.div>
  );

  return (
    <div ref={rootRef} className="fixed bottom-5 right-5 z-[90]"
      onMouseEnter={touch ? undefined : show} onMouseLeave={touch ? undefined : hide}
      onFocus={touch ? undefined : show}
      onBlur={touch ? undefined : (e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) hide(); }}>
      {isPill ? (
        <div className={`flex items-center rounded-full transition-[background-color,box-shadow] duration-300 ${
          open ? "bg-white p-1.5 -m-1.5 shadow-2xl shadow-slate-900/20 ring-1 ring-slate-100" : ""}`}>
          <AnimatePresence>{open && <Panel key="pill" touch={touch} onClose={close} />}</AnimatePresence>
          {fab}
        </div>
      ) : (
        <div className="flex flex-col items-end gap-4">
          <AnimatePresence>{open && <Panel key={style} touch={touch} onClose={close} />}</AnimatePresence>
          {fab}
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

  // Always open at the top on load/refresh (browsers otherwise restore the old scroll position)
  useEffect(() => {
    if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
    if (window.location.hash) window.history.replaceState(null, "", window.location.pathname + window.location.search);
    window.scrollTo(0, 0);
  }, []);

  return (
    <LangCtx.Provider value={{ lang, setLang }}>
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
      <WhatsAppFloat />
    </div>
    </LangCtx.Provider>
  );
}