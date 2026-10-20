// src/config/nav-registry.ts
//
// Single source of truth for the restaurant-owner (tenant) navigation.
// Both the owner portal (/app) and the super-admin control page read from
// here, so a new page is added in ONE place and immediately becomes
// manageable from the admin console.
//
// Rules:
//  - `key` is the stable identifier stored in the database. NEVER rename a
//    key once it has shipped — rename `label` instead.
//  - `locked: true` means the destination can't be switched off. Dashboard
//    and Settings are locked because hiding them strands the owner.

import {
  LayoutDashboard, ListOrdered, Utensils, QrCode, Users, Star, UsersRound,
  LineChart, Settings, CreditCard, Cpu, TrendingUp, History, Wallet,
  MessageCircle, ShoppingCart, Timer,
} from "lucide-react";

export type NavItem = {
  key: string;
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  secure?: boolean; // needs the owner PIN / password
  locked?: boolean; // cannot be disabled by the super admin
  feature?: string; // plan feature key (see plan-features.ts) that includes this page
};

export type NavSection = {
  key: string;
  label: string;
  locked?: boolean;
  items: NavItem[];
};

// Fifteen destinations in one list is unscannable. The groups follow how a
// restaurant actually runs: service first, then the menu, then everything
// that can wait until the shift is over.
export const TENANT_SECTIONS: NavSection[] = [
  {
    key: "service",
    label: "Service",
    locked: true,
    items: [
      { key: "dashboard", to: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true, locked: true, feature: "dashboards" },
      { key: "orders", to: "/app/orders", label: "Live orders", icon: ListOrdered, feature: "live_orders" },
      { key: "kds", to: "/app/kds", label: "Kitchen Display", icon: Cpu, feature: "kitchen_display" },
      { key: "history", to: "/app/history", label: "Order history", icon: History, feature: "order_history" },
      { key: "sessions", to: "/app/sessions", label: "Table sessions", icon: Timer, feature: "order_history" },
    ],
  },
  {
    key: "menu_tables",
    label: "Menu & tables",
    items: [
      { key: "menu", to: "/app/menu", label: "Menu", icon: Utensils, feature: "menu" },
      { key: "tables", to: "/app/tables", label: "Tables & QR", icon: QrCode, feature: "tables_qr" },
    ],
  },
  {
    key: "customers",
    label: "Customers",
    items: [
      { key: "customers_list", to: "/app/customers", label: "Customers", icon: Users, feature: "customers" },
      { key: "whatsapp", to: "/app/whatsapp", label: "WhatsApp", icon: MessageCircle, feature: "whatsapp" },
      { key: "reviews", to: "/app/reviews", label: "Reviews", icon: Star, feature: "reviews" },
    ],
  },
  {
    key: "money",
    label: "Money",
    items: [
      { key: "revenue", to: "/app/revenue", label: "Revenue", icon: TrendingUp, secure: true, feature: "revenue" },
      { key: "expenses", to: "/app/expenses", label: "Expenses", icon: Wallet, secure: true, feature: "expenses" },
      { key: "analytics", to: "/app/analytics", label: "Analytics", icon: LineChart, secure: true, feature: "analytics" },
    ],
  },
  {
    key: "business",
    label: "Business",
    items: [
      { key: "staff", to: "/app/staff", label: "Staff", icon: UsersRound, secure: true, feature: "staff_management" },
      { key: "shop", to: "/app/products", label: "Shop", icon: ShoppingCart, feature: "shop" },
      { key: "subscription", to: "/app/subscription", label: "Subscription", icon: CreditCard, locked: true },
      { key: "settings", to: "/app/settings", label: "Settings", icon: Settings, secure: true, locked: true },
    ],
  },
];

// Bottom tabs on mobile — a subset of the item keys above, in tab order.
// Anything hidden by the super admin drops out of here automatically.
export const MOBILE_TAB_KEYS = ["dashboard", "orders", "kds", "menu", "settings"] as const;

export const ALL_ITEMS: NavItem[] = TENANT_SECTIONS.flatMap((s) => s.items);

export const ALL_KEYS: string[] = TENANT_SECTIONS.flatMap((s) => [s.key, ...s.items.map((i) => i.key)]);

export const isActivePath = (
  pathname: string,
  it: { to: string; exact?: boolean },
) => (it.exact ? pathname === it.to : pathname === it.to || pathname.startsWith(it.to + "/"));

/** The registry item a URL belongs to — used to block hidden pages by URL. */
export const findItemByPath = (pathname: string): NavItem | null => {
  // Longest `to` wins so /app/orders beats the exact-match /app entry.
  const matches = ALL_ITEMS.filter((it) => isActivePath(pathname, it));
  return matches.sort((a, b) => b.to.length - a.to.length)[0] ?? null;
};

/** The section a given item key sits in. */
export const sectionOfItem = (itemKey: string): NavSection | null =>
  TENANT_SECTIONS.find((s) => s.items.some((i) => i.key === itemKey)) ?? null;