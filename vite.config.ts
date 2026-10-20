// // // @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// // // or the app will break with duplicate plugins:
// // //   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
// // //     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
// // //     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// // // You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
// // import { defineConfig } from "@lovable.dev/vite-tanstack-config";
// // import { loadEnv } from "vite";

// // export default defineConfig({
// //   tanstackStart: {
// //     // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// //     // nitro/vite builds from this
// //     server: { entry: "server" },
// //   },
// //   vite: {
// //     plugins: [
// //       {
// //         name: "load-server-env",
// //         config(_, { mode }) {
// //           const env = loadEnv(mode, process.cwd(), "");
// //           for (const key in env) {
// //             if (process.env[key] === undefined) {
// //               process.env[key] = env[key];
// //             }
// //           }
// //         },
// //       },
// //     ],
// //   },
// // });




// import { defineConfig } from "@lovable.dev/vite-tanstack-config";
// import { loadEnv } from "vite";

// export default defineConfig({
//   tanstackStart: {
//     server: { entry: "server" },
//   },
//   vite: {
//     plugins: [
//       {
//         name: "load-server-env",
//         config(_config, { mode }) {
//           const env = loadEnv(mode, process.cwd(), "");

//           for (const key in env) {
//             if (process.env[key] === undefined) {
//               process.env[key] = env[key];
//             }
//           }
//         },
//       },
//     ],
//   },
// });




import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    tsConfigPaths(),
    tailwindcss(),
    tanstackStart({
      server: {
        entry: "server",
      },
    }),
    viteReact(),
  ],
});
