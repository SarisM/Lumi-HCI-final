
  import { createRoot } from "react-dom/client";
  import App from "./App.tsx";
  import "./index.css";

  // Service worker registration disabled in favor of server-side push (Edge Function).
  createRoot(document.getElementById("root")!).render(<App />);
  