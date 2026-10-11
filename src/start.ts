import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { getSelectedOutletId } from "@/lib/outlet-context";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Tells server functions which outlet an owner is working in (see
// src/lib/outlet.server.ts). Not part of the generated Supabase integration.
const attachOutlet = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const outletId = getSelectedOutletId();
  return next({ headers: outletId ? { "x-outlet-id": outletId } : {} });
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth, attachOutlet],
  requestMiddleware: [errorMiddleware],
}));
