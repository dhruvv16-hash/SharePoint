import { useState } from "react";
import { trpc } from "@/providers/trpc";
import {
  Camera,
  Plus,
  RotateCcw,
  Trash2,
  Calendar,
  HardDrive,
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

export default function Snapshots() {
  const { data: snapshots, isLoading, refetch } = trpc.snapshot.list.useQuery();

  const createMutation = trpc.snapshot.create.useMutation({
    onSuccess: (data) => {
      toast.success(`Snapshot "${data.name}" created`);
      refetch();
      setCreateOpen(false);
    },
  });

  const restoreMutation = trpc.snapshot.restore.useMutation({
    onSuccess: () => {
      toast.success("Snapshot restored");
      refetch();
    },
  });

  const deleteMutation = trpc.snapshot.delete.useMutation({
    onSuccess: () => {
      toast.success("Snapshot deleted");
      refetch();
    },
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [snapshotName, setSnapshotName] = useState("");
  const [snapshotType, setSnapshotType] = useState("manual");

  const handleCreate = () => {
    if (snapshotName.trim()) {
      createMutation.mutate({
        name: snapshotName.trim(),
        snapshotType: snapshotType as "daily" | "weekly" | "manual",
      });
    }
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
          <h1 className="text-[24px] font-light tracking-[-0.3px]">Snapshots</h1>
          <p className="text-[13px] text-[#888888]">
            Point-in-time backups of your entire vault
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="bg-black text-white hover:bg-[#222] text-[12px] h-8"
        >
          <Plus size={14} className="mr-1" />
          New Snapshot
        </Button>
      </div>

      {snapshots && snapshots.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {snapshots.map((snapshot) => (
            <div
              key={snapshot.id}
              className="p-4 bg-white border border-[rgba(0,0,0,0.08)] rounded hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)] transition-all"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="p-2 bg-[#f8f8f8] rounded">
                  <Camera size={18} />
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => restoreMutation.mutate({ snapshotId: snapshot.id })}
                    className="p-1.5 hover:bg-green-50 hover:text-green-600 rounded transition-colors"
                    title="Restore"
                  >
                    <RotateCcw size={12} />
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate({ snapshotId: snapshot.id })}
                    className="p-1.5 hover:bg-red-50 hover:text-red-500 rounded transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              <h3 className="text-[14px] font-medium mb-1">{snapshot.name}</h3>
              <div className="flex items-center gap-1 text-[11px] text-[#888888] mb-2">
                <Calendar size={10} />
                {snapshot.createdAt ? new Date(snapshot.createdAt).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                }) : "—"}
              </div>

              <div className="flex items-center gap-3 text-[11px] text-[#888888]">
                <span className="flex items-center gap-0.5">
                  <HardDrive size={10} />
                  {formatBytes(snapshot.size || 0)}
                </span>
                <span className="capitalize bg-[#f8f8f8] px-1.5 py-0.5 rounded">
                  {snapshot.snapshotType}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-[#888888]">
          <Camera size={48} strokeWidth={1} className="mb-4" />
          <p className="text-[14px] mb-1">No snapshots yet</p>
          <p className="text-[12px] mb-4">Create a snapshot to save your vault state</p>
          <Button
            onClick={() => setCreateOpen(true)}
            className="bg-black text-white hover:bg-[#222] text-[12px]"
          >
            Create Snapshot
          </Button>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-[14px] font-normal">Create Snapshot</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-[11px] text-[#888888] uppercase tracking-[0.5px]">Name</label>
              <Input
                value={snapshotName}
                onChange={(e) => setSnapshotName(e.target.value)}
                placeholder={`Vault_${new Date().toISOString().slice(0, 10).replace(/-/g, "_")}`}
                className="text-[12px] mt-1"
              />
            </div>
            <div>
              <label className="text-[11px] text-[#888888] uppercase tracking-[0.5px]">Type</label>
              <Select value={snapshotType} onValueChange={setSnapshotType}>
                <SelectTrigger className="text-[12px] mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending || !snapshotName.trim()}
              className="w-full bg-black text-white hover:bg-[#222] text-[12px]"
            >
              {createMutation.isPending ? "Creating..." : "Create Snapshot"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
