import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./App.css";
import Home from "./pages/Home/Home";
import PVE from "./pages/PVE/PVE";
import PVP from "./pages/PVP/PVP";
import Introduction from "./pages/Introduction/Introduction";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/pve" element={<PVE />} />
        <Route path="/pvp" element={<PVP />} />
        <Route path="/intro" element={<Introduction />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
