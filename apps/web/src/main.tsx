import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import "mapbox-gl/dist/mapbox-gl.css";

import { AppearanceProvider, initializeAppearance } from "./appearance";
import { ErrorBoundary } from "./components/error-boundary";
import { router } from "./router";
import { ToastProvider } from "./toast";
import "./styles.css";

initializeAppearance();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppearanceProvider>
      <ErrorBoundary>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </ErrorBoundary>
    </AppearanceProvider>
  </React.StrictMode>
);
