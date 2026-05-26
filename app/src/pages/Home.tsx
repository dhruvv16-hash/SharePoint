import { useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import {
  HardDrive,
  Share2,
  Shield,
  Clock,
  ArrowRight,
  FolderOpen,
  Upload,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group flex items-start gap-4 p-5 bg-white border border-[rgba(0,0,0,0.08)] rounded text-left hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 transition-all duration-300"
    >
      <div className="p-2.5 bg-[#f8f8f8] rounded group-hover:bg-black group-hover:text-white transition-colors">
        <Icon size={20} strokeWidth={1.5} />
      </div>
      <div>
        <div className="text-[11px] text-[#888888] uppercase tracking-[0.5px] mb-1">{label}</div>
        <div className="text-[20px] font-light tracking-[-0.3px]">{value}</div>
        <div className="text-[11px] text-[#888888] mt-0.5">{sub}</div>
      </div>
    </button>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const { data: stats } = trpc.vault.stats.useQuery();
  const { data: shares } = trpc.share.list.useQuery();
  const { data: snapshots } = trpc.snapshot.list.useQuery();

  const formatBytes = (bytes: number) => {
    if (!bytes) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const storagePercent = stats?.storageQuota
    ? Math.min(100, Math.round(((stats.storageUsed || 0) / stats.storageQuota) * 100))
    : 0;

  return (
    <div className="h-full overflow-y-auto">
      {/* Hero Section */}
      <div className="relative bg-black text-white px-8 py-12 overflow-hidden">
        <div className="absolute inset-0 opacity-30">
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 30% 50%, rgba(0,229,255,0.15) 0%, transparent 50%), radial-gradient(circle at 70% 50%, rgba(96,239,255,0.1) 0%, transparent 50%)",
            }}
          />
          <div className="absolute inset-0" style={{ backgroundImage: "url('data:image/svg+xml,%3Csvg width=\"60\" height=\"60\" viewBox=\"0 0 60 60\" xmlns=\"http://www.w3.org/2000/svg\"%3E%3Cg fill=\"none\" fill-rule=\"evenodd\"%3E%3Cg fill=\"%23ffffff\" fill-opacity=\"0.03\"%3E%3Cpath d=\"M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\"/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')" }} />
        </div>
        <div className="relative z-10 max-w-4xl">
          <h1 className="text-[36px] font-light tracking-[-0.5px] leading-[1.1] mb-2">
            Your digital vault.
          </h1>
          <p className="text-[14px] text-white/60 font-light tracking-[0.2px]">
            Secure. Permanent. Yours.
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="px-8 py-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          <StatCard
            icon={HardDrive}
            label="Storage Used"
            value={formatBytes(stats?.storageUsed || 0)}
            sub={`${stats?.fileCount || 0} files, ${stats?.folderCount || 0} folders`}
            onClick={() => navigate("/vault")}
          />
          <StatCard
            icon={Share2}
            label="Active Shares"
            value={`${(shares?.filter((s) => s.isActive)?.length || 0)}`}
            sub={`${shares?.length || 0} total shares`}
            onClick={() => navigate("/shares")}
          />
          <StatCard
            icon={Shield}
            label="Security"
            value="Protected"
            sub="AES-256 encryption"
            onClick={() => navigate("/settings")}
          />
          <StatCard
            icon={Clock}
            label="Snapshots"
            value={`${snapshots?.length || 0}`}
            sub="Available restore points"
            onClick={() => navigate("/snapshots")}
          />
        </div>

        {/* Storage bar */}
        <div className="mb-8 p-5 bg-white border border-[rgba(0,0,0,0.08)] rounded">
          <div className="flex justify-between items-center mb-3">
            <span className="text-[13px] font-normal">Storage Usage</span>
            <span className="text-[11px] text-[#888888]">
              {formatBytes(stats?.storageUsed || 0)} of {formatBytes(stats?.storageQuota || 10737418240)}
            </span>
          </div>
          <Progress value={storagePercent} className="h-2 mb-2" />
          <div className="flex justify-between text-[10px] text-[#888888]">
            <span>{storagePercent}% used</span>
            <span>{formatBytes((stats?.storageQuota || 0) - (stats?.storageUsed || 0))} free</span>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mb-8">
          <h2 className="text-[13px] text-[#888888] uppercase tracking-[0.5px] mb-3">Quick Actions</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Button
              onClick={() => navigate("/upload?modal=1")}
              variant="outline"
              className="h-auto py-4 flex flex-col items-center gap-2 border-[rgba(0,0,0,0.08)] hover:bg-[#f8f8f8] hover:border-black transition-all"
            >
              <Upload size={20} strokeWidth={1.5} />
              <span className="text-[12px]">Upload Files</span>
            </Button>
            <Button
              onClick={() => navigate("/vault")}
              variant="outline"
              className="h-auto py-4 flex flex-col items-center gap-2 border-[rgba(0,0,0,0.08)] hover:bg-[#f8f8f8] hover:border-black transition-all"
            >
              <FolderOpen size={20} strokeWidth={1.5} />
              <span className="text-[12px]">Browse Vault</span>
            </Button>
            <Button
              onClick={() => navigate("/shares")}
              variant="outline"
              className="h-auto py-4 flex flex-col items-center gap-2 border-[rgba(0,0,0,0.08)] hover:bg-[#f8f8f8] hover:border-black transition-all"
            >
              <Share2 size={20} strokeWidth={1.5} />
              <span className="text-[12px]">Create Share</span>
            </Button>
            <Button
              onClick={() => navigate("/ai")}
              variant="outline"
              className="h-auto py-4 flex flex-col items-center gap-2 border-[rgba(0,0,0,0.08)] hover:bg-[#f8f8f8] hover:border-black transition-all"
            >
              <Lock size={20} strokeWidth={1.5} />
              <span className="text-[12px]">AI Assistant</span>
            </Button>
          </div>
        </div>

        {/* Recent Activity */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[13px] text-[#888888] uppercase tracking-[0.5px]">Recent Activity</h2>
            <button
              onClick={() => navigate("/workspaces")}
              className="text-[11px] text-[#888888] hover:text-black flex items-center gap-1 transition-colors"
            >
              View all <ArrowRight size={12} />
            </button>
          </div>
          <div className="bg-white border border-[rgba(0,0,0,0.08)] rounded divide-y divide-[rgba(0,0,0,0.04)]">
            {[
              { action: "File uploaded", detail: "project_final.zip", time: "2 min ago", icon: Upload },
              { action: "Share created", detail: "Design Assets folder", time: "1 hour ago", icon: Share2 },
              { action: "Folder created", detail: "Q2 Reports", time: "3 hours ago", icon: FolderOpen },
              { action: "Version restored", detail: "document_v3.pdf", time: "Yesterday", icon: Clock },
            ].map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-4 py-3 hover:bg-[#f8f8f8] transition-colors"
              >
                <div className="p-1.5 bg-[#f8f8f8] rounded">
                  <item.icon size={14} strokeWidth={1.5} />
                </div>
                <div className="flex-1">
                  <span className="text-[13px]">{item.action}</span>
                  <span className="text-[13px] text-[#888888] ml-2">{item.detail}</span>
                </div>
                <span className="text-[11px] text-[#888888]">{item.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
