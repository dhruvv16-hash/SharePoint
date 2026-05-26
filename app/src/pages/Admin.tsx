import { trpc } from "@/providers/trpc";
import {
  Users,
  HardDrive,
  Share2,
  Shield,
  Activity,
  Loader2,
  CheckCircle,
} from "lucide-react";

const formatBytes = (bytes: number) => {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color = "black",
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub: string;
  color?: string;
}) {
  return (
    <div className="p-5 bg-white border border-[rgba(0,0,0,0.08)] rounded hover:shadow-[0_4px_16px_rgba(0,0,0,0.04)] transition-shadow">
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 bg-[#f8f8f8] rounded" style={{ color }}>
          <Icon size={18} strokeWidth={1.5} />
        </div>
        <span className="text-[11px] text-[#888888] uppercase tracking-[0.5px]">{label}</span>
      </div>
      <div className="text-[24px] font-light tracking-[-0.3px] mb-1">{value}</div>
      <div className="text-[11px] text-[#888888]">{sub}</div>
    </div>
  );
}

export default function Admin() {
  const { data: stats, isLoading: statsLoading } = trpc.admin.stats.useQuery();
  const { data: users, isLoading: usersLoading } = trpc.admin.users.useQuery({});
  const { data: health } = trpc.admin.systemHealth.useQuery();

  if (statsLoading || usersLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-[#888888]" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-8 py-6">
      <div className="mb-6">
        <h1 className="text-[24px] font-light tracking-[-0.3px]">Admin Panel</h1>
        <p className="text-[13px] text-[#888888]">Platform overview and management</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <StatCard
          icon={Users}
          label="Total Users"
          value={`${stats?.users || 0}`}
          sub="Registered accounts"
        />
        <StatCard
          icon={HardDrive}
          label="Total Storage"
          value={formatBytes(stats?.totalStorage || 0)}
          sub="Across all users"
          color="#2563eb"
        />
        <StatCard
          icon={Share2}
          label="Active Shares"
          value={`${stats?.shares || 0}`}
          sub="Public and private links"
          color="#7c3aed"
        />
        <StatCard
          icon={Shield}
          label="Recovery Items"
          value={`${stats?.recoveryItems || 0}`}
          sub="Items in trash"
          color="#dc2626"
        />
      </div>

      {/* System Health */}
      {health && (
        <div className="mb-8 p-4 bg-white border border-[rgba(0,0,0,0.08)] rounded">
          <div className="flex items-center gap-2 mb-3">
            <Activity size={16} />
            <h2 className="text-[14px] font-medium">System Health</h2>
            <span className="ml-auto flex items-center gap-1 text-[11px] text-green-600">
              <CheckCircle size={12} />
              {health.status}
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-[12px]">
            <div>
              <span className="text-[#888888]">Uptime</span>
              <div className="font-mono">{Math.floor(health.uptime / 60)}m {Math.floor(health.uptime % 60)}s</div>
            </div>
            <div>
              <span className="text-[#888888]">Memory Used</span>
              <div className="font-mono">{formatBytes(health.memory.heapUsed)}</div>
            </div>
            <div>
              <span className="text-[#888888]">RSS</span>
              <div className="font-mono">{formatBytes(health.memory.rss)}</div>
            </div>
            <div>
              <span className="text-[#888888]">Timestamp</span>
              <div className="font-mono">{new Date(health.timestamp).toLocaleTimeString()}</div>
            </div>
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="mb-8">
        <h2 className="text-[14px] font-medium mb-3">Users</h2>
        {users && users.length > 0 ? (
          <div className="border border-[rgba(0,0,0,0.08)] rounded overflow-hidden">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-[#f8f8f8]">
                  <th className="text-left px-4 py-2 font-medium text-[#888888]">User</th>
                  <th className="text-left px-4 py-2 font-medium text-[#888888]">Role</th>
                  <th className="text-left px-4 py-2 font-medium text-[#888888]">Plan</th>
                  <th className="text-left px-4 py-2 font-medium text-[#888888]">Storage</th>
                  <th className="text-left px-4 py-2 font-medium text-[#888888]">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(0,0,0,0.04)]">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-[#f8f8f8] transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-black text-white flex items-center justify-center text-[10px]">
                          {(user.displayName || user.name || user.username || "?").charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium">{user.displayName || user.name || user.username}</div>
                          <div className="text-[10px] text-[#888888]">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded capitalize ${
                        user.role === "admin" ? "bg-black text-white" : "bg-[#f8f8f8]"
                      }`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 capitalize">{user.plan}</td>
                    <td className="px-4 py-2.5 font-mono">{formatBytes(user.storageUsed || 0)}</td>
                    <td className="px-4 py-2.5 text-[#888888]">
                      {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-[12px] text-[#888888]">No users found</p>
        )}
      </div>
    </div>
  );
}
