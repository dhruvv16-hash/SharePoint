import { trpc } from "@/providers/trpc";
import {
  Trash2,
  RotateCcw,
  AlertTriangle,
  Clock,
  File,
  Folder,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const formatBytes = (bytes: number) => {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

const formatDate = (date: Date | null) => {
  if (!date) return "";
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function Recovery() {
  const { data: items, isLoading, refetch } = trpc.recovery.list.useQuery({});
  const restoreMutation = trpc.recovery.restore.useMutation({
    onSuccess: () => {
      toast.success("Item restored");
      refetch();
    },
  });
  const permanentDeleteMutation = trpc.recovery.permanentDelete.useMutation({
    onSuccess: () => {
      toast.success("Permanently deleted");
      refetch();
    },
  });
  const emptyTrashMutation = trpc.recovery.emptyTrash.useMutation({
    onSuccess: () => {
      toast.success("Trash emptied");
      refetch();
    },
  });

  const handleRestore = (id: number) => {
    restoreMutation.mutate({ id });
  };

  const handlePermanentDelete = (id: number) => {
    if (confirm("This action cannot be undone. Delete permanently?")) {
      permanentDeleteMutation.mutate({ id });
    }
  };

  const handleEmptyTrash = () => {
    if (confirm("Empty trash permanently? This cannot be undone.")) {
      emptyTrashMutation.mutate();
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
          <h1 className="text-[24px] font-light tracking-[-0.3px]">Trash / Recovery</h1>
          <p className="text-[13px] text-[#888888]">
            Deleted items are kept for 30 days before permanent removal
          </p>
        </div>
        {items && items.length > 0 && (
          <Button
            onClick={handleEmptyTrash}
            variant="outline"
            className="text-[12px] h-8 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            <Trash2 size={14} className="mr-1" />
            Empty Trash
          </Button>
        )}
      </div>

      {/* Info Banner */}
      <div className="flex items-center gap-3 p-4 bg-[#f8f8f8] rounded mb-6 border border-[rgba(0,0,0,0.08)]">
        <AlertTriangle size={16} className="text-[#888888] flex-shrink-0" />
        <p className="text-[12px] text-[#888888]">
          Items in trash can be restored within 30 days. After that, they will be permanently deleted.
        </p>
      </div>

      {items && items.length > 0 ? (
        <div className="border border-[rgba(0,0,0,0.08)] rounded divide-y divide-[rgba(0,0,0,0.04)]">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-4 px-4 py-3 hover:bg-[#f8f8f8] transition-colors"
            >
              <div className="p-2 bg-[#f8f8f8] rounded">
                {item.resourceType === "folder" ? (
                  <Folder size={16} className="text-[#888888]" />
                ) : (
                  <File size={16} className="text-[#888888]" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] truncate">{item.name}</div>
                <div className="text-[11px] text-[#888888] flex items-center gap-2">
                  <span className="capitalize">{item.resourceType}</span>
                  {item.size ? <span>{formatBytes(item.size)}</span> : null}
                  <span className="flex items-center gap-0.5">
                    <Clock size={10} />
                    Deleted {formatDate(item.deletedAt)}
                  </span>
                  {item.expiresAt && (
                    <span>
                      Expires {formatDate(item.expiresAt)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleRestore(item.id)}
                  className="p-2 hover:bg-green-50 hover:text-green-600 rounded transition-colors"
                  title="Restore"
                >
                  <RotateCcw size={14} />
                </button>
                <button
                  onClick={() => handlePermanentDelete(item.id)}
                  className="p-2 hover:bg-red-50 hover:text-red-500 rounded transition-colors"
                  title="Delete permanently"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-[#888888]">
          <Trash2 size={48} strokeWidth={1} className="mb-4" />
          <p className="text-[14px] mb-1">Trash is empty</p>
          <p className="text-[12px]">Deleted items will appear here</p>
        </div>
      )}
    </div>
  );
}
