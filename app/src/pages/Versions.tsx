import { useState } from "react";
import { useSearchParams } from "react-router";
import { trpc } from "@/providers/trpc";
import {
  Clock,
  GitBranch,
  RotateCcw,
  Plus,
  Download,
  Trash2,
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
import { toast } from "sonner";

const formatBytes = (bytes: number) => {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

export default function Versions() {
  const [searchParams] = useSearchParams();
  const fileId = searchParams.get("fileId")
    ? parseInt(searchParams.get("fileId")!)
    : undefined;

  const { data: versions, isLoading, refetch } = trpc.version.list.useQuery(
    { fileId: fileId || 0 },
    { enabled: !!fileId }
  );

  const createMutation = trpc.version.create.useMutation({
    onSuccess: () => {
      toast.success("Version created");
      refetch();
    },
  });

  const restoreMutation = trpc.version.restore.useMutation({
    onSuccess: () => {
      toast.success("Version restored");
      refetch();
    },
  });

  const deleteMutation = trpc.version.delete.useMutation({
    onSuccess: () => {
      toast.success("Version deleted");
      refetch();
    },
  });

  const [comment, setComment] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  if (!fileId) {
    return (
      <div className="h-full flex items-center justify-center text-[#888888]">
        <div className="text-center">
          <GitBranch size={48} strokeWidth={1} className="mx-auto mb-4" />
          <p className="text-[14px] mb-1">Select a file to view versions</p>
          <p className="text-[12px]">Go to your vault and select a file to see its version history</p>
        </div>
      </div>
    );
  }

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
          <h1 className="text-[24px] font-light tracking-[-0.3px]">Version History</h1>
          <p className="text-[13px] text-[#888888]">
            {versions?.length || 0} versions for file #{fileId}
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="bg-black text-white hover:bg-[#222] text-[12px] h-8"
        >
          <Plus size={14} className="mr-1" />
          Save Version
        </Button>
      </div>

      {versions && versions.length > 0 ? (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-[19px] top-0 bottom-0 w-px bg-[rgba(0,0,0,0.08)]" />

          <div className="space-y-4">
            {versions.map((version) => (
              <div key={version.id} className="flex items-start gap-4 relative">
                <div className="w-10 h-10 rounded-full bg-[#f8f8f8] border border-[rgba(0,0,0,0.08)] flex items-center justify-center z-10">
                  <Clock size={14} />
                </div>
                <div className="flex-1 p-4 bg-white border border-[rgba(0,0,0,0.08)] rounded hover:shadow-[0_4px_16px_rgba(0,0,0,0.04)] transition-shadow">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium">
                        Version {version.versionNumber}
                      </span>
                      {version.versionNumber === versions[0]?.versionNumber && (
                        <span className="text-[10px] bg-black text-white px-1.5 py-0.5 rounded">
                          Current
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() =>
                          restoreMutation.mutate({ fileId, versionId: version.id })
                        }
                        className="p-1.5 hover:bg-green-50 hover:text-green-600 rounded transition-colors"
                        title="Restore this version"
                      >
                        <RotateCcw size={12} />
                      </button>
                      <button className="p-1.5 hover:bg-[#f0f0f0] rounded transition-colors" title="Download">
                        <Download size={12} />
                      </button>
                      {version.versionNumber !== 1 && (
                        <button
                          onClick={() => deleteMutation.mutate({ versionId: version.id })}
                          className="p-1.5 hover:bg-red-50 hover:text-red-500 rounded transition-colors"
                          title="Delete version"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                  {version.comment && (
                    <p className="text-[12px] text-[#888888] mb-1">{version.comment}</p>
                  )}
                  <div className="flex items-center gap-3 text-[11px] text-[#888888]">
                    <span>{formatBytes(version.size || 0)}</span>
                    <span>{version.createdAt ? new Date(version.createdAt).toLocaleDateString() : "—"}</span>
                    {version.checksum && (
                      <span className="font-mono">{version.checksum.slice(0, 16)}...</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-[#888888]">
          <GitBranch size={48} strokeWidth={1} className="mb-4" />
          <p className="text-[14px] mb-1">No versions yet</p>
          <p className="text-[12px] mb-4">Save versions to track changes over time</p>
          <Button
            onClick={() => setCreateOpen(true)}
            className="bg-black text-white hover:bg-[#222] text-[12px]"
          >
            Create First Version
          </Button>
        </div>
      )}

      {/* Create Version Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-[14px] font-normal">Save Version</DialogTitle>
          </DialogHeader>
          <Input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Version comment (optional)"
            className="text-[12px]"
          />
          <Button
            onClick={() => {
              createMutation.mutate({ fileId, comment });
              setCreateOpen(false);
              setComment("");
            }}
            disabled={createMutation.isPending}
            className="bg-black text-white hover:bg-[#222] text-[12px]"
          >
            {createMutation.isPending ? "Saving..." : "Save Version"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
