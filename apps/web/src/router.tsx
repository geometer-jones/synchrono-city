import { createBrowserRouter } from "react-router-dom";

import { AppShell } from "./routes/app-shell";
import { ChatsRoute } from "./routes/chats-route";
import { PulseRoute } from "./routes/pulse-route";
import { SettingsRoute } from "./routes/settings-route";
import { SplashRoute } from "./routes/splash-route";
import { WorldRoute } from "./routes/world-route";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <SplashRoute />
  },
  {
    path: "/app",
    element: <AppShell />,
    children: [
      { index: true, element: <WorldRoute /> },
      { path: "chats", element: <ChatsRoute /> },
      { path: "pulse", element: <PulseRoute /> },
      { path: "settings", element: <SettingsRoute /> }
    ]
  }
]);
