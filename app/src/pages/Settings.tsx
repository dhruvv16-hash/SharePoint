import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/providers/trpc";
import {
  Monitor,
  Smartphone,
  Tablet,
  Shield,
  LogOut,
  Trash2,
  History,
  Fingerprint,
  KeyRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useNavigate } from "react-router";

const formatBytes = (bytes: number) => {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

export default function Settings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const utils = trpc.useUtils();

  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [email, setEmail] = useState(user?.email || "");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [twoFactor, setTwoFactor] = useState(user?.twoFactorEnabled || false);
  const [encryptionMode, setEncryptionMode] = useState(user?.encryptionMode || "standard");
  const [theme, setTheme] = useState("light");

  const { data: devices, refetch: refetchDevices } = trpc.localAuth.devices.useQuery();
  const { data: sessions, refetch: refetchSessions } = trpc.localAuth.sessions.useQuery();

  const updateProfile = trpc.localAuth.updateProfile.useMutation({
    onSuccess: () => {
      toast.success("Profile updated");
      utils.auth.me.invalidate();
    },
  });

  const changePassword = trpc.localAuth.changePassword.useMutation({
    onSuccess: () => {
      toast.success("Password changed");
      setOldPassword("");
      setNewPassword("");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const updateSecurity = trpc.localAuth.updateSecurity.useMutation({
    onSuccess: () => {
      toast.success("Security settings updated");
      utils.auth.me.invalidate();
    },
  });

  const trustDevice = trpc.localAuth.trustDevice.useMutation({
    onSuccess: () => {
      toast.success("Device trusted");
      refetchDevices();
      refetchSessions();
    },
  });

  const revokeDevice = trpc.localAuth.revokeDevice.useMutation({
    onSuccess: () => {
      toast.success("Device revoked");
      refetchDevices();
      refetchSessions();
    },
  });

  const logoutAllDevices = trpc.localAuth.logoutAllDevices.useMutation({
    onSuccess: () => {
      toast.success("All devices logged out");
      refetchDevices();
      refetchSessions();
      navigate("/login");
    },
  });

  const deleteAccount = trpc.localAuth.deleteAccount.useMutation({
    onSuccess: () => {
      toast.success("Account deleted");
      navigate("/login");
    },
  });

  const handleUpdateProfile = () => {
    updateProfile.mutate({ displayName, email });
  };

  const handleChangePassword = () => {
    if (oldPassword && newPassword) {
      changePassword.mutate({ oldPassword, newPassword });
    }
  };

  const handleSecuritySave = () => {
    updateSecurity.mutate({ twoFactorEnabled: twoFactor, encryptionMode: encryptionMode as "standard" | "zero_knowledge" });
  };

  const storageUsed = user?.storageUsed || 0;
  const storageQuota = user?.storageQuota || 10737418240;
  const storagePercent = Math.min(100, Math.round((storageUsed / storageQuota) * 100));

  return (
    <div className="h-full overflow-y-auto px-8 py-6">
      <h1 className="text-[24px] font-light tracking-[-0.3px] mb-6">Settings</h1>

      <Tabs defaultValue="profile" className="max-w-4xl">
        <TabsList className="mb-4">
          <TabsTrigger value="profile" className="text-[12px]">Profile</TabsTrigger>
          <TabsTrigger value="security" className="text-[12px]">Security</TabsTrigger>
          <TabsTrigger value="storage" className="text-[12px]">Storage</TabsTrigger>
          <TabsTrigger value="devices" className="text-[12px]">Devices</TabsTrigger>
          <TabsTrigger value="sessions" className="text-[12px]">Sessions</TabsTrigger>
          <TabsTrigger value="vault" className="text-[12px]">Vault</TabsTrigger>
          <TabsTrigger value="account" className="text-[12px]">Account</TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="space-y-4">
          <div className="p-5 bg-white border border-[rgba(0,0,0,0.08)] rounded">
            <h3 className="text-[14px] font-medium mb-4">Profile Information</h3>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-[#888888] uppercase tracking-[0.5px]">
                  Display Name
                </label>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="text-[12px] mt-1"
                />
              </div>
              <div>
                <label className="text-[11px] text-[#888888] uppercase tracking-[0.5px]">
                  Email
                </label>
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="text-[12px] mt-1"
                />
              </div>
              <Button
                onClick={handleUpdateProfile}
                disabled={updateProfile.isPending}
                className="bg-black text-white hover:bg-[#222] text-[12px]"
              >
                {updateProfile.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="space-y-4">
          <div className="p-5 bg-white border border-[rgba(0,0,0,0.08)] rounded">
            <h3 className="text-[14px] font-medium mb-4">Change Password</h3>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-[#888888] uppercase tracking-[0.5px]">
                  Current Password
                </label>
                <Input
                  type="password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  className="text-[12px] mt-1"
                />
              </div>
              <div>
                <label className="text-[11px] text-[#888888] uppercase tracking-[0.5px]">
                  New Password
                </label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="text-[12px] mt-1"
                />
              </div>
              <Button
                onClick={handleChangePassword}
                disabled={changePassword.isPending || !oldPassword || !newPassword}
                className="bg-black text-white hover:bg-[#222] text-[12px]"
              >
                {changePassword.isPending ? "Changing..." : "Change Password"}
              </Button>
            </div>
          </div>

          <div className="p-5 bg-white border border-[rgba(0,0,0,0.08)] rounded">
            <h3 className="text-[14px] font-medium mb-4">Encryption</h3>
            <div className="flex items-center justify-between py-2">
              <div>
                <div className="text-[13px]">Encryption Mode</div>
                <div className="text-[11px] text-[#888888]">
                  {encryptionMode === "standard"
                    ? "Server-managed keys"
                    : "Client-side zero-knowledge"}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setEncryptionMode("standard")}
                  className={`px-3 py-1 text-[11px] rounded transition-colors ${
                    encryptionMode === "standard"
                      ? "bg-black text-white"
                      : "bg-[#f8f8f8] text-[#888888]"
                  }`}
                >
                  Standard
                </button>
                <button
                  onClick={() => setEncryptionMode("zero_knowledge")}
                  className={`px-3 py-1 text-[11px] rounded transition-colors ${
                    encryptionMode === "zero_knowledge"
                      ? "bg-black text-white"
                      : "bg-[#f8f8f8] text-[#888888]"
                  }`}
                >
                  Zero Knowledge
                </button>
              </div>
            </div>
            <div className="mt-4">
              <Button
                onClick={handleSecuritySave}
                disabled={updateSecurity.isPending}
                className="bg-black text-white hover:bg-[#222] text-[12px]"
              >
                {updateSecurity.isPending ? "Saving..." : "Save Security Settings"}
              </Button>
            </div>
          </div>

          <div className="p-5 bg-white border border-[rgba(0,0,0,0.08)] rounded">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[14px] font-medium">Two-Factor Authentication</h3>
                <p className="text-[11px] text-[#888888]">
                  Add an extra layer of security to your account
                </p>
              </div>
              <Switch checked={twoFactor} onCheckedChange={setTwoFactor} />
            </div>
          </div>
        </TabsContent>

        {/* Storage Tab */}
        <TabsContent value="storage" className="space-y-4">
          <div className="p-5 bg-white border border-[rgba(0,0,0,0.08)] rounded">
            <h3 className="text-[14px] font-medium mb-4">Storage Usage</h3>
            <div className="mb-3">
              <div className="flex justify-between text-[12px] mb-1">
                <span>{formatBytes(storageUsed)} used</span>
                <span>{formatBytes(storageQuota)} total</span>
              </div>
              <div className="h-2 bg-[#f0f0f0] rounded overflow-hidden">
                <div
                  className="h-full bg-black transition-all duration-500"
                  style={{ width: `${storagePercent}%` }}
                />
              </div>
              <div className="text-[11px] text-[#888888] mt-1">{storagePercent}% used</div>
            </div>
            <div className="text-[12px] text-[#888888]">
              <p>Plan: <span className="capitalize font-medium text-black">{user?.plan || "free"}</span></p>
              {user?.plan === "free" && (
                <p className="mt-1">Upgrade to Pro for 1TB storage</p>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Devices Tab */}
        <TabsContent value="devices" className="space-y-4">
          <div className="p-5 bg-white border border-[rgba(0,0,0,0.08)] rounded">
            <h3 className="text-[14px] font-medium mb-4">Trusted Devices</h3>
            <div className="space-y-3">
              {(devices || []).map((device) => (
                <div
                  key={device.id}
                  className="flex items-center gap-3 p-3 bg-[#f8f8f8] rounded"
                >
                  {device.deviceType === "desktop" ? (
                    <Monitor size={16} />
                  ) : device.deviceType === "mobile" ? (
                    <Smartphone size={16} />
                  ) : (
                    <Tablet size={16} />
                  )}
                  <div className="flex-1">
                    <div className="text-[12px] font-medium">{device.deviceName}</div>
                    <div className="text-[10px] text-[#888888]">
                      Last active {new Date(device.lastActiveAt).toLocaleString()}
                    </div>
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${device.isTrusted ? "bg-black text-white" : "bg-[#f0f0f0] text-[#444]"}`}>
                    {device.isTrusted ? "Trusted" : "Untrusted"}
                  </span>
                  <button
                    onClick={() => trustDevice.mutate({ deviceId: device.id, trusted: !device.isTrusted })}
                    className="text-[10px] text-black hover:underline"
                  >
                    {device.isTrusted ? "Untrust" : "Trust"}
                  </button>
                  <button
                    onClick={() => revokeDevice.mutate({ deviceId: device.id })}
                    className="text-[10px] text-red-500 hover:underline"
                  >
                    Revoke
                  </button>
                </div>
              ))}
              {(devices || []).length === 0 && (
                <div className="text-[12px] text-[#888888]">No devices recorded yet.</div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="sessions" className="space-y-4">
          <div className="p-5 bg-white border border-[rgba(0,0,0,0.08)] rounded">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[14px] font-medium">Session History</h3>
              <Button
                size="sm"
                variant="outline"
                onClick={() => logoutAllDevices.mutate()}
                className="text-[11px] h-7"
              >
                <LogOut size={12} className="mr-1" />
                Logout All Devices
              </Button>
            </div>
            <div className="space-y-2">
              {(sessions || []).map((session) => (
                <div key={session.id} className="flex items-center gap-3 p-3 bg-[#f8f8f8] rounded">
                  <History size={14} />
                  <div className="flex-1">
                    <div className="text-[12px] font-medium capitalize">{session.event.replace("-", " ")}</div>
                    <div className="text-[10px] text-[#888888]">
                      {session.deviceName} • {new Date(session.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <span className="text-[10px] text-[#888888]">{session.deviceType}</span>
                </div>
              ))}
              {(sessions || []).length === 0 && (
                <div className="text-[12px] text-[#888888]">No session history yet.</div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="vault" className="space-y-4">
          <div className="p-5 bg-white border border-[rgba(0,0,0,0.08)] rounded space-y-4">
            <h3 className="text-[14px] font-medium">Vault Management</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[12px] text-[#555]">
              <div className="p-3 bg-[#f8f8f8] rounded">
                <div className="font-medium mb-1">Plan</div>
                <div className="capitalize">{user?.plan || "free"}</div>
              </div>
              <div className="p-3 bg-[#f8f8f8] rounded">
                <div className="font-medium mb-1">Storage Quota</div>
                <div>{formatBytes(storageQuota)}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => navigate("/workspaces")} className="text-[11px] h-7">
                <Shield size={12} className="mr-1" />
                Manage Team Spaces
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate("/recovery")} className="text-[11px] h-7">
                <Fingerprint size={12} className="mr-1" />
                Open Recovery
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate("/versions")} className="text-[11px] h-7">
                <KeyRound size={12} className="mr-1" />
                Open Versions
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="account" className="space-y-4">
          <div className="p-5 bg-white border border-[rgba(0,0,0,0.08)] rounded space-y-4">
            <h3 className="text-[14px] font-medium">Account</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[12px]">
              <div className="p-3 bg-[#f8f8f8] rounded">
                <div className="text-[#888888] text-[10px] uppercase tracking-[0.5px]">Username</div>
                <div>{user?.username}</div>
              </div>
              <div className="p-3 bg-[#f8f8f8] rounded">
                <div className="text-[#888888] text-[10px] uppercase tracking-[0.5px]">Email</div>
                <div>{user?.email}</div>
              </div>
              <div className="p-3 bg-[#f8f8f8] rounded">
                <div className="text-[#888888] text-[10px] uppercase tracking-[0.5px]">Role</div>
                <div className="capitalize">{user?.role || "user"}</div>
              </div>
              <div className="p-3 bg-[#f8f8f8] rounded">
                <div className="text-[#888888] text-[10px] uppercase tracking-[0.5px]">Theme</div>
                <div className="flex gap-2 mt-2">
                  <button onClick={() => setTheme("light")} className={`px-2 py-1 rounded text-[11px] ${theme === "light" ? "bg-black text-white" : "bg-white"}`}>
                    Light
                  </button>
                  <button onClick={() => setTheme("dark")} className={`px-2 py-1 rounded text-[11px] ${theme === "dark" ? "bg-black text-white" : "bg-white"}`}>
                    Dark
                  </button>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => logoutAllDevices.mutate()}
                className="text-[11px] h-7"
              >
                <LogOut size={12} className="mr-1" />
                Logout All Sessions
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => deleteAccount.mutate()}
                className="text-[11px] h-7"
              >
                <Trash2 size={12} className="mr-1" />
                Delete Account
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
