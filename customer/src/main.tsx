import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { TrackingPage } from "./components/TrackingPage";
import "./styles.css";

const container = document.getElementById("root");
if (!container) throw new Error("Falta el contenedor #root");

// One extra screen doesn't justify pulling in react-router-dom: a plain
// pathname check picks between the order site and the tracking page.
const page = window.location.pathname.startsWith("/rastreo") ? <TrackingPage /> : <App />;

createRoot(container).render(<StrictMode>{page}</StrictMode>);
