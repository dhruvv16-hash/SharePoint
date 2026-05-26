import { Routes, Route } from "react-router";
import AppLayout from "@/components/layout/AppLayout";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Vault from "./pages/Vault";
import Upload from "./pages/Upload";
import Shares from "./pages/Shares";
import Recovery from "./pages/Recovery";
import Versions from "./pages/Versions";
import Snapshots from "./pages/Snapshots";
import Workspaces from "./pages/Workspaces";
import Search from "./pages/Search";
import Admin from "./pages/Admin";
import AIAssistant from "./pages/AIAssistant";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<AppLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/vault" element={<Vault />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/shares" element={<Shares />} />
        <Route path="/shares/create" element={<Shares />} />
        <Route path="/recovery" element={<Recovery />} />
        <Route path="/versions" element={<Versions />} />
        <Route path="/snapshots" element={<Snapshots />} />
        <Route path="/workspaces" element={<Workspaces />} />
        <Route path="/search" element={<Search />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/ai" element={<AIAssistant />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
