import { useState } from "react";
import { useSearchParams } from "react-router";
import { trpc } from "@/providers/trpc";
import {
  Link,
  Copy,
  Trash2,
  Lock,
  Globe,
  Users,
  Download,
  Clock,
  Plus,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export default function Shares() {
  const [searchParams] = useSearchParams();
  const preselectedFileId = searchParams.get("fileId")
    ? parseInt(searchParams.get("fileId")!)
    : undefined;

  const { data: shares, isLoading, refetch } = trpc.share.list.useQuery();
  const revokeMutation = trpc.share.revoke.useMutation({
    onSuccess: () => {
      toast.success("Share revoked");
      refetch();
    },
  });

  const { data: vaultItems } = trpc.vault.list.useQuery(
    { showDeleted: false },
    { enabled: !preselectedFileId }
  );

  const [selectedFileId, setSelectedFileId] = useState<string>("");
  const [createOpen, setCreateOpen] = useState(!!preselectedFileId);
  const [shareType, setShareType] = useState("private");
  const [password, setPassword] = useState("");
  const [expiresIn, setExpiresIn] = useState("");
  const [permissions, setPermissions] = useState("read");
  const [maxDownloads, setMaxDownloads] = useState("");

  const formatBytes = (bytes: number) => {
    if (!bytes) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const createMutation = trpc.share.create.useMutation({
    onSuccess: (data) => {
      toast.success(`Share created: ${data.shareUrl}`);
      setCreateOpen(false);
      setSelectedFileId("");
      refetch();
    },
  });

  const handleCreate = () => {
    const finalFileId = preselectedFileId || (selectedFileId && selectedFileId !== "no-files" ? parseInt(selectedFileId, 10) : undefined);
    if (!finalFileId) {
      toast.error("Please select a file to share");
      return;
    }
    createMutation.mutate({
      fileId: finalFileId,
      shareType: shareType as "private" | "password" | "public" | "team",
      password: password || undefined,
      permissions: permissions as "read" | "write" | "upload" | "admin",
      expiresIn: expiresIn ? parseInt(expiresIn, 10) : undefined,
      maxDownloads: maxDownloads ? parseInt(maxDownloads, 10) : undefined,
    });
  };

  const copyLink = (token: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/share/${token}`);
    toast.success("Link copied");
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-[#888888]" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-8 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[24px] font-light tracking-[-0.3px]">Shared Links</h1>
          <p className="text-[13px] text-[#888888]">
            Manage your shared files and folders
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="bg-black text-white hover:bg-[#222] text-[12px] h-8"
        >
          <Plus size={14} className="mr-1" />
          New Share
        </Button>
      </div>

      {shares && shares.length > 0 ? (
        <div className="border border-[rgba(0,0,0,0.08)] rounded divide-y divide-[rgba(0,0,0,0.04)]">
          {shares.map((share) => (
            <div
              key={share.id}
              className="flex items-center gap-4 px-4 py-3 hover:bg-[#f8f8f8] transition-colors"
            >
              <div className="p-2 bg-[#f8f8f8] rounded">
                {share.shareType === "password" ? (
                  <Lock size={16} />
                ) : share.shareType === "public" ? (
                  <Globe size={16} />
                ) : share.shareType === "team" ? (
                  <Users size={16} />
                ) : (
                  <Link size={16} />
                )}
              </div>
              <div className="flex-1">
                <div className="text-[13px] font-medium">
                  {share.shareType === "private"
                    ? "Private Link"
                    : share.shareType === "password"
                    ? "Password Protected"
                    : share.shareType === "public"
                    ? "Public Link"
                    : "Team Share"}
                </div>
                <div className="text-[11px] text-[#888888]">
                  <span className="capitalize">{share.permissions}</span> access
                  {share.expiresAt && (
                    <span className="ml-2">
                      <Clock size={10} className="inline mr-0.5" />
                      Expires {new Date(share.expiresAt).toLocaleDateString()}
                    </span>
                  )}
                  {share.maxDownloads && (
                    <span className="ml-2">
                      <Download size={10} className="inline mr-0.5" />
                      {share.downloadCount || 0} / {share.maxDownloads} downloads
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {share.isActive && (
                  <button
                    onClick={() => copyLink(share.token)}
                    className="p-2 hover:bg-[#f0f0f0] rounded transition-colors"
                    title="Copy link"
                  >
                    <Copy size={14} />
                  </button>
                )}
                <button
                  onClick={() => revokeMutation.mutate({ shareId: share.id })}
                  className="p-2 hover:bg-red-50 hover:text-red-500 rounded transition-colors"
                  title="Revoke"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-[#888888]">
          <Link size={48} strokeWidth={1} className="mb-4" />
          <p className="text-[14px] mb-2">No shares yet</p>
          <p className="text-[12px] mb-4">Create a share link for your files</p>
          <Button
            onClick={() => setCreateOpen(true)}
            className="bg-black text-white hover:bg-[#222] text-[12px]"
          >
            Create Share
          </Button>
        </div>
      )}

      {/* Create Share Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="text-[14px] font-normal">Create Share Link</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {!preselectedFileId && (
              <div>
                <label className="text-[11px] text-[#888888] uppercase tracking-[0.5px]">
                  Select File
                </label>
                <Select value={selectedFileId} onValueChange={setSelectedFileId}>
                  <SelectTrigger className="text-[12px] mt-1">
                    <SelectValue placeholder="Choose a file..." />
                  </SelectTrigger>
                  <SelectContent>
                    {vaultItems?.files && vaultItems.files.length > 0 ? (
                      vaultItems.files.map((file) => (
                        <SelectItem key={file.id} value={String(file.id)}>
                          {file.name} ({formatBytes(file.size || 0)})
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="no-files" disabled>No files available in root</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <label className="text-[11px] text-[#888888] uppercase tracking-[0.5px]">
                Share Type
              </label>
              <Select value={shareType} onValueChange={setShareType}>
                <SelectTrigger className="text-[12px] mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private Link</SelectItem>
                  <SelectItem value="password">Password Protected</SelectItem>
                  <SelectItem value="public">Public Link</SelectItem>
                  <SelectItem value="team">Team Share</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {shareType === "password" && (
              <div>
                <label className="text-[11px] text-[#888888] uppercase tracking-[0.5px]">
                  Password
                </label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="text-[12px] mt-1"
                />
              </div>
            )}

            <div>
              <label className="text-[11px] text-[#888888] uppercase tracking-[0.5px]">
                Permissions
              </label>
              <Select value={permissions} onValueChange={setPermissions}>
                <SelectTrigger className="text-[12px] mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="read">Read Only</SelectItem>
                  <SelectItem value="write">Read & Write</SelectItem>
                  <SelectItem value="upload">Read, Write & Upload</SelectItem>
                  <SelectItem value="admin">Full Access</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-[#888888] uppercase tracking-[0.5px]">
                  Expires (hours)
                </label>
                <Input
                  type="number"
                  value={expiresIn}
                  onChange={(e) => setExpiresIn(e.target.value)}
                  placeholder="Never"
                  className="text-[12px] mt-1"
                />
              </div>
              <div>
                <label className="text-[11px] text-[#888888] uppercase tracking-[0.5px]">
                  Max Downloads
                </label>
                <Input
                  type="number"
                  value={maxDownloads}
                  onChange={(e) => setMaxDownloads(e.target.value)}
                  placeholder="Unlimited"
                  className="text-[12px] mt-1"
                />
              </div>
            </div>

            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending}
              className="w-full bg-black text-white hover:bg-[#222] text-[12px] mt-2"
            >
              {createMutation.isPending ? "Creating..." : "Create Share"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
