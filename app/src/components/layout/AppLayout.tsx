import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import {
  HardDrive,
  Share2,
  Users,
  Trash2,
  Clock,
  Shield,
  Settings,
  Plus,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Search,
  Zap,
  Image,
  FileText,
  Music,
  Video,
  Archive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

function SidebarItem({
  icon: Icon,
  label,
  active,
  onClick,
  count,
}: {
  icon: React.ElementType;
  label: string;
  active: boolean;
  onClick: () => void;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 text-[13px] font-400 tracking-[0.2px] rounded transition-all duration-200 ${
        active
          ? "bg-black text-white"
          : "text-[#888888] hover:text-black hover:bg-[#f8f8f8]"
      }`}
    >
      <Icon size={16} strokeWidth={1.5} />
      <span className="flex-1 text-left">{label}</span>
      {count !== undefined && count > 0 && (
        <span className="text-[11px] text-[#888888]">{count}</span>
      )}
    </button>
  );
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const storageUsed = user?.storageUsed || 0;
  const storageQuota = user?.storageQuota || 10737418240;
  const storagePercent = Math.min(100, Math.round((storageUsed / storageQuota) * 100));

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const navItems = [
    { icon: HardDrive, label: "My Vault", path: "/vault" },
    { icon: Share2, label: "Shared Links", path: "/shares" },
    { icon: Users, label: "Team Spaces", path: "/workspaces" },
    { icon: Trash2, label: "Trash / Recovery", path: "/recovery" },
    { icon: Clock, label: "Versions", path: "/versions" },
    { icon: Archive, label: "Snapshots", path: "/snapshots" },
  ];

  const quickAccess = [
    { icon: Image, label: "Images", path: "/vault?type=image" },
    { icon: FileText, label: "Documents", path: "/vault?type=document" },
    { icon: Video, label: "Videos", path: "/vault?type=video" },
    { icon: Music, label: "Audio", path: "/vault?type=audio" },
    { icon: Zap, label: "AI Assistant", path: "/ai" },
  ];

  const isAdmin = user?.role === "admin";

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white">
      {/* Sidebar */}
      <aside
        className={`flex-shrink-0 h-full border-r border-[rgba(0,0,0,0.08)] flex flex-col transition-all duration-300 ${
          collapsed ? "w-[60px]" : "w-[240px]"
        }`}
        style={{
          background: "rgba(255, 255, 255, 0.6)",
          backdropFilter: "blur(12px)",
        }}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-4 h-14 border-b border-[rgba(0,0,0,0.08)]">
          {!collapsed && (
            <button onClick={() => navigate("/")} className="text-[16px] font-light tracking-[-0.3px]">
              SharedPoint
            </button>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 hover:bg-[#f8f8f8] rounded"
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        {/* Storage meter */}
        {!collapsed && (
          <div className="px-4 py-3 border-b border-[rgba(0,0,0,0.08)]">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[11px] text-[#888888] uppercase tracking-[0.5px]">
                Storage
              </span>
              <span className="text-[11px] text-[#888888]">
                {formatBytes(storageUsed)} / {formatBytes(storageQuota)}
              </span>
            </div>
            <Progress value={storagePercent} className="h-1" />
            <div className="mt-1 text-[10px] text-[#888888]">{storagePercent}% used</div>
          </div>
        )}

        {/* New Upload Button */}
        <div className="px-3 py-3">
          <Button
            onClick={() => navigate("/upload?modal=1")}
            className="w-full bg-black text-white hover:bg-[#222] text-[12px] font-normal h-9 rounded"
          >
            <Plus size={14} className="mr-1.5" />
            {!collapsed && "New Upload"}
          </Button>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
          {!collapsed && (
            <div className="px-3 pt-2 pb-1 text-[10px] text-[#888888] uppercase tracking-[0.5px]">
              Vault
            </div>
          )}
          {navItems.map((item) => (
            <SidebarItem
              key={item.path}
              icon={item.icon}
              label={collapsed ? "" : item.label}
              active={location.pathname === item.path}
              onClick={() => navigate(item.path)}
            />
          ))}

          {!collapsed && (
            <div className="px-3 pt-4 pb-1 text-[10px] text-[#888888] uppercase tracking-[0.5px]">
              Quick Access
            </div>
          )}
          {quickAccess.map((item) => (
            <SidebarItem
              key={item.path}
              icon={item.icon}
              label={collapsed ? "" : item.label}
              active={location.pathname + location.search === item.path}
              onClick={() => navigate(item.path)}
            />
          ))}

          {isAdmin && (
            <>
              {!collapsed && (
                <div className="px-3 pt-4 pb-1 text-[10px] text-[#888888] uppercase tracking-[0.5px]">
                  Admin
                </div>
              )}
              <SidebarItem
                icon={Shield}
                label={collapsed ? "" : "Admin Panel"}
                active={location.pathname === "/admin"}
                onClick={() => navigate("/admin")}
              />
            </>
          )}
        </div>

        {/* Bottom section */}
        <div className="border-t border-[rgba(0,0,0,0.08)] px-2 py-2 space-y-0.5">
          <SidebarItem
            icon={Search}
            label={collapsed ? "" : "Search"}
            active={false}
            onClick={() => navigate("/search")}
          />
          <SidebarItem
            icon={Settings}
            label={collapsed ? "" : "Settings"}
            active={location.pathname === "/settings"}
            onClick={() => navigate("/settings")}
          />
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2 text-[13px] text-[#888888] hover:text-red-600 hover:bg-red-50 rounded transition-all"
          >
            <LogOut size={16} strokeWidth={1.5} />
            {!collapsed && <span>Logout</span>}
          </button>
          {!collapsed && user && (
            <div className="flex items-center gap-2 px-3 py-2 mt-1">
              {user.avatar ? (
                <img src={user.avatar} alt="" className="w-6 h-6 rounded-full" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-black text-white flex items-center justify-center text-[10px]">
                  {(user.displayName || user.name || user.username || "U").charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-medium truncate">
                  {user.displayName || user.name || user.username}
                </div>
                <div className="text-[10px] text-[#888888] truncate">{user.email}</div>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
