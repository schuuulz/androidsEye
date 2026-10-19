import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

// Sem StrictMode: a montagem dupla em dev abriria duas sessões de adb shell.
createRoot(document.getElementById("root")!).render(<App />);
