import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // Preload a route's JS chunk + beforeLoad on link hover/touchstart instead
    // of waiting for the click — the dashboards' route-per-page code splitting
    // means this is what actually makes in-app navigation feel instant.
    defaultPreload: "intent",
  });

  return router;
};
