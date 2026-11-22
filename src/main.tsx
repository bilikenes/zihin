import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import "./ui";
import "./app.css";
import App from "./App";
import { PaletteView } from "./PaletteView";

/** Palet penceresi `index.html?palette` adresini açar; tarayıcıda geliştirirken aynı adres denenebilir. */
const isPalette = new URLSearchParams(window.location.search).has("palette");

createRoot(document.getElementById("root")!).render(
  <StrictMode>{isPalette ? <PaletteView /> : <App />}</StrictMode>,
);
