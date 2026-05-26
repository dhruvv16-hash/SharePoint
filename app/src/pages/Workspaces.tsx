import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/providers/trpc";
import {
  Users,
  Plus,
  FolderOpen,
  UserPlus,
  Loader2,
  ArrowRightLeft,
  LogOut,
  PencilLine,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const formatBytes = (bytes: number) => {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

const roleColors: Record<string, string> = {
  owner: "bg-black text-white",
  manager: "bg-[#333] text-white",
  editor: "bg-[#666] text-white",
  viewer: "bg-[#999] text-white",
  guest: "bg-[#ccc] text-black",
};

export default function Workspaces() {
  const { user } = useAuth();
  const { data: workspaces, isLoading, refetch } = trpc.workspace.list.useQuery();

  const createMutation = trpc.workspace.create.useMutation({
    onSuccess: () => {
      toast.success("Workspace created");
      refetch();
      setCreateOpen(false);
    },
  });

  const inviteMutation = trpc.workspace.invite.useMutation({
    onSuccess: (data) => {
      toast.success(`Invited ${data.invitedUser}`);
      refetch();
      setInviteOpen(false);
    },
  });

  const renameMutation = trpc.workspace.rename.useMutation({
    onSuccess: () => {
      toast.success("Workspace updated");
      refetch();
    },
  });

  const transferMutation = trpc.workspace.transferOwnership.useMutation({
    onSuccess: () => {
      toast.success("Ownership transferred");
      refetch();
    },
  });

  const leaveMutation = trpc.workspace.leave.useMutation({
    onSuccess: () => {
      toast.success("Left workspace");
      setSelectedWorkspace(null);
      refetch();
    },
  });

  const removeMemberMutation = trpc.workspace.removeMember.useMutation({
    onSuccess: () => {
      toast.success("Member removed");
      refetch();
    },
  });

  const updateMemberMutation = trpc.workspace.updateMember.useMutation({
    onSuccess: () => {
      toast.success("Member role updated");
      refetch();
    },
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selectedWorkspace, setSelectedWorkspace] = useState<number | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [wsName, setWsName] = useState("");
  const [wsSlug, setWsSlug] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [renameName, setRenameName] = useState("");
  const [renameSlug, setRenameSlug] = useState("");
  const [renameDescription, setRenameDescription] = useState("");
  const [transferTarget, setTransferTarget] = useState("");

  const { data: members } = trpc.workspace.members.useQuery(
    { workspaceId: selectedWorkspace! },
    { enabled: !!selectedWorkspace }
  );

  const { data: activity } = trpc.workspace.activity.useQuery(
    { workspaceId: selectedWorkspace || undefined, limit: 10 },
    { enabled: !!selectedWorkspace }
  );

  const handleCreate = () => {
    if (wsName.trim() && wsSlug.trim()) {
      createMutation.mutate({
        name: wsName.trim(),
        slug: wsSlug.trim().toLowerCase().replace(/\s+/g, "-"),
      });
    }
  };

  const handleInvite = () => {
    if (selectedWorkspace && inviteEmail.trim()) {
      inviteMutation.mutate({
        workspaceId: selectedWorkspace,
        email: inviteEmail.trim(),
        role: inviteRole as "manager" | "editor" | "viewer" | "guest",
      });
    }
  };

  const selectedWorkspaceData = [...(workspaces?.owned || []), ...(workspaces?.member || [])].find(
    (workspace) => workspace.id === selectedWorkspace
  );

  const isOwner = selectedWorkspaceData ? (selectedWorkspaceData as Record<string, unknown>).ownerId === user?.id : false;

  const handleRename = () => {
    if (!selectedWorkspace || !renameName.trim()) return;
    renameMutation.mutate({
      workspaceId: selectedWorkspace,
      name: renameName.trim(),
      slug: renameSlug.trim() || undefined,
      description: renameDescription.trim() || undefined,
    });
    setRenameOpen(false);
  };

  const handleTransferOwnership = () => {
    if (!selectedWorkspace || !transferTarget) return;
    transferMutation.mutate({ workspaceId: selectedWorkspace, newOwnerId: parseInt(transferTarget, 10) });
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-[#888888]" />
      </div>
    );
  }

  const allWorkspaces = [
    ...(workspaces?.owned || []),
    ...(workspaces?.member || []),
  ];

  return (
    <div className="h-full overflow-y-auto px-8 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[24px] font-light tracking-[-0.3px]">Team Spaces</h1>
          <p className="text-[13px] text-[#888888]">
            Collaborate with your team in shared workspaces
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="bg-black text-white hover:bg-[#222] text-[12px] h-8"
        >
          <Plus size={14} className="mr-1" />
          New Workspace
        </Button>
      </div>

      {allWorkspaces.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {allWorkspaces.map((ws: typeof allWorkspaces[0]) => (
            <div
              key={ws.id}
              className="p-5 bg-white border border-[rgba(0,0,0,0.08)] rounded hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)] transition-all cursor-pointer"
              onClick={() => setSelectedWorkspace(ws.id)}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="p-2 bg-[#f8f8f8] rounded">
                  <FolderOpen size={20} strokeWidth={1.5} />
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded capitalize ${roleColors[String((ws as Record<string, unknown>).memberRole || "owner")]}`}>
                  {String((ws as Record<string, unknown>).memberRole || "owner")}
                </span>
              </div>
              <h3 className="text-[15px] font-medium mb-1">{ws.name}</h3>
              <p className="text-[12px] text-[#888888] mb-3">/{ws.slug}</p>
              <div className="flex items-center justify-between text-[11px] text-[#888888]">
                <span className="flex items-center gap-1">
                  <Users size={12} />
                  Members
                </span>
                <span>{formatBytes(ws.storageUsed || 0)} / {formatBytes(ws.storageQuota || 0)}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-[#888888]">
          <Users size={48} strokeWidth={1} className="mb-4" />
          <p className="text-[14px] mb-1">No workspaces yet</p>
          <p className="text-[12px] mb-4">Create a workspace to start collaborating</p>
          <Button
            onClick={() => setCreateOpen(true)}
            className="bg-black text-white hover:bg-[#222] text-[12px]"
          >
            Create Workspace
          </Button>
        </div>
      )}

      {/* Members Panel (shown when workspace selected) */}
      {selectedWorkspace && members && (
        <div className="mt-6 border border-[rgba(0,0,0,0.08)] rounded p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[14px] font-medium">Workspace Members</h3>
            <div className="flex items-center gap-2">
              {isOwner && (
                <Button
                  onClick={() => setRenameOpen(true)}
                  size="sm"
                  variant="outline"
                  className="text-[11px] h-7"
                >
                  <PencilLine size={12} className="mr-1" />
                  Rename
                </Button>
              )}
              <Button
                onClick={() => setInviteOpen(true)}
                size="sm"
                className="text-[11px] h-7 bg-black text-white hover:bg-[#222]"
              >
                <UserPlus size={12} className="mr-1" />
                Invite
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            {members.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-3 px-3 py-2 hover:bg-[#f8f8f8] rounded transition-colors"
              >
                <div className="w-7 h-7 rounded-full bg-black text-white flex items-center justify-center text-[10px]">
                  {(m.user?.displayName || m.user?.name || m.user?.username || "?").charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="text-[12px]">{m.user?.displayName || m.user?.name || m.user?.username}</div>
                  <div className="text-[10px] text-[#888888]">{m.user?.email || "—"}</div>
                </div>
                {isOwner ? (
                  <Select
                    value={m.role || "viewer"}
                    onValueChange={(value) => updateMemberMutation.mutate({ workspaceId: selectedWorkspace!, userId: m.userId, role: value as "owner" | "manager" | "editor" | "viewer" | "guest" })}
                  >
                    <SelectTrigger className="h-7 w-[120px] text-[11px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="owner">Owner</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="editor">Editor</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                      <SelectItem value="guest">Guest</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded capitalize ${roleColors[m.role || "viewer"]}`}>
                    {m.role}
                  </span>
                )}
                {isOwner && m.userId !== user?.id && (
                  <Button
                    onClick={() => removeMemberMutation.mutate({ workspaceId: selectedWorkspace!, userId: m.userId })}
                    className="text-[10px] text-red-500 hover:underline"
                  >
                    Remove
                  </Button>
                )}
              </div>
            ))}
          </div>
          {isOwner && (
            <div className="mt-4 pt-4 border-t border-[rgba(0,0,0,0.08)] space-y-3">
              <div className="flex items-center gap-2">
                <Select value={transferTarget} onValueChange={setTransferTarget}>
                  <SelectTrigger className="w-[240px] text-[11px] h-8">
                    <SelectValue placeholder="Transfer ownership to..." />
                  </SelectTrigger>
                  <SelectContent>
                    {members.filter((m) => m.userId !== user?.id).map((m) => (
                      <SelectItem key={m.userId} value={String(m.userId)}>
                        {m.user?.displayName || m.user?.name || m.user?.username}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" className="text-[11px] h-8" onClick={handleTransferOwnership}>
                  <ArrowRightLeft size={12} className="mr-1" />
                  Transfer Ownership
                </Button>
              </div>
            </div>
          )}
          {!isOwner && selectedWorkspaceData && (
            <div className="mt-4 pt-4 border-t border-[rgba(0,0,0,0.08)]">
              <Button size="sm" variant="outline" className="text-[11px] h-8" onClick={() => leaveMutation.mutate({ workspaceId: selectedWorkspace! })}>
                <LogOut size={12} className="mr-1" />
                Leave Workspace
              </Button>
            </div>
          )}
        </div>
      )}

      {selectedWorkspace && activity && (
        <div className="mt-6 border border-[rgba(0,0,0,0.08)] rounded p-4">
          <h3 className="text-[14px] font-medium mb-3">Workspace Activity</h3>
          <div className="space-y-2">
            {activity.map((item) => (
              <div key={item.id} className="flex items-center gap-3 px-3 py-2 rounded bg-[#f8f8f8]">
                <Shield size={14} />
                <div className="flex-1 text-[12px]">
                  <span className="font-medium">{item.action}</span>
                  <span className="text-[#888888] ml-2">
                    {item.details && typeof item.details === "object" && "message" in item.details
                      ? String(item.details.message)
                      : item.resourceName || "workspace activity"}
                  </span>
                </div>
                <span className="text-[10px] text-[#888888]">
                  {item.createdAt ? new Date(item.createdAt).toLocaleString() : "just now"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-[14px] font-normal">New Workspace</DialogTitle>
            <DialogDescription className="text-[12px] text-[#888888]">
              Create a shared space for a team, project, or client.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={wsName}
              onChange={(e) => {
                setWsName(e.target.value);
                setWsSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"));
              }}
              placeholder="Workspace name"
              className="text-[12px]"
            />
            <Input
              value={wsSlug}
              onChange={(e) => setWsSlug(e.target.value)}
              placeholder="workspace-slug"
              className="text-[12px]"
            />
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending || !wsName.trim()}
              className="w-full bg-black text-white hover:bg-[#222] text-[12px]"
            >
              {createMutation.isPending ? "Creating..." : "Create Workspace"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-[14px] font-normal">Rename Workspace</DialogTitle>
            <DialogDescription className="text-[12px] text-[#888888]">
              Update the workspace name, slug, and description.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input value={renameName} onChange={(e) => setRenameName(e.target.value)} placeholder="Workspace name" className="text-[12px]" />
            <Input value={renameSlug} onChange={(e) => setRenameSlug(e.target.value)} placeholder="workspace-slug" className="text-[12px]" />
            <Input value={renameDescription} onChange={(e) => setRenameDescription(e.target.value)} placeholder="Description" className="text-[12px]" />
            <Button onClick={handleRename} disabled={renameMutation.isPending || !renameName.trim()} className="w-full bg-black text-white hover:bg-[#222] text-[12px]">
              {renameMutation.isPending ? "Saving..." : "Save Workspace"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-[14px] font-normal">Invite Member</DialogTitle>
            <DialogDescription className="text-[12px] text-[#888888]">
              Add a teammate and set their default workspace role.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="Email address"
              type="email"
              className="text-[12px]"
            />
            <Select value={inviteRole} onValueChange={setInviteRole}>
              <SelectTrigger className="text-[12px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="editor">Editor</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
                <SelectItem value="guest">Guest</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={handleInvite}
              disabled={inviteMutation.isPending || !inviteEmail.trim()}
              className="w-full bg-black text-white hover:bg-[#222] text-[12px]"
            >
              {inviteMutation.isPending ? "Inviting..." : "Send Invite"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
