import { useState } from "react";
import { useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import {
  Folder,
  File,
  ChevronRight,
  MoreVertical,
  Trash2,
  Edit3,
  Share2,
  Clock,
  Grid3X3,
  List,
  ArrowUpDown,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

function FileIcon({ mimeType }: { mimeType?: string | null }) {
  if (!mimeType) return <File size={20} strokeWidth={1.5} />;
  if (mimeType.startsWith("image/")) return <File size={20} strokeWidth={1.5} className="text-blue-500" />;
  if (mimeType.startsWith("video/")) return <File size={20} strokeWidth={1.5} className="text-purple-500" />;
  if (mimeType.startsWith("audio/")) return <File size={20} strokeWidth={1.5} className="text-orange-500" />;
  if (mimeType.includes("pdf")) return <File size={20} strokeWidth={1.5} className="text-red-500" />;
  if (mimeType.includes("zip") || mimeType.includes("archive"))
    return <File size={20} strokeWidth={1.5} className="text-yellow-500" />;
  return <File size={20} strokeWidth={1.5} />;
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatDate(date: Date | null) {
  if (!date) return "";
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function Vault() {
  const navigate = useNavigate();
  const [currentFolder, setCurrentFolder] = useState<number | undefined>();
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [sortBy, setSortBy] = useState<"name" | "date" | "size">("date");
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [renameDialog, setRenameDialog] = useState<{ id: number; type: "file" | "folder"; name: string } | null>(null);
  const [newName, setNewName] = useState("");
  const [createFolderDialog, setCreateFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const { data: vaultData, isLoading, refetch } = trpc.vault.list.useQuery({
    folderId: currentFolder,
  });
  const { data: breadcrumbs } = trpc.vault.breadcrumbs.useQuery(
    { folderId: currentFolder! },
    { enabled: !!currentFolder }
  );

  const renameMutation = trpc.vault.rename.useMutation({
    onSuccess: () => {
      toast.success("Renamed successfully");
      refetch();
      setRenameDialog(null);
    },
  });

  const deleteMutation = trpc.vault.delete.useMutation({
    onSuccess: () => {
      toast.success("Moved to trash");
      refetch();
      setSelectedItems(new Set());
    },
  });

  const createFolderMutation = trpc.vault.createFolder.useMutation({
    onSuccess: () => {
      toast.success("Folder created");
      refetch();
      setCreateFolderDialog(false);
      setNewFolderName("");
    },
  });

  const handleRename = () => {
    if (renameDialog && newName.trim()) {
      renameMutation.mutate({
        id: renameDialog.id,
        type: renameDialog.type,
        name: newName.trim(),
      });
    }
  };

  const handleDelete = (id: number, type: "file" | "folder") => {
    if (confirm(`Move this ${type} to trash?`)) {
      deleteMutation.mutate({ ids: [id], type });
    }
  };

  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      createFolderMutation.mutate({
        name: newFolderName.trim(),
        parentId: currentFolder,
      });
    }
  };

  const toggleSelection = (id: number) => {
    const next = new Set(selectedItems);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedItems(next);
  };

  const sortedFiles = [...(vaultData?.files || [])].sort((a, b) => {
    if (sortBy === "name") return a.name.localeCompare(b.name);
    if (sortBy === "size") return (b.size || 0) - (a.size || 0);
    return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
  });

  const sortedFolders = [...(vaultData?.folders || [])].sort((a, b) => {
    if (sortBy === "name") return a.name.localeCompare(b.name);
    return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
  });

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-[#888888]" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-[rgba(0,0,0,0.08)]">
        {/* Breadcrumbs */}
        <div className="flex items-center gap-1 text-[13px]">
          <button
            onClick={() => navigate("/upload?modal=1")}
            className={`hover:underline ${!currentFolder ? "font-medium" : ""}`}
          >
            My Vault
          </button>
          {breadcrumbs?.map((crumb) => (
            <span key={crumb.id} className="flex items-center gap-1">
              <ChevronRight size={14} className="text-[#888888]" />
              <button
                onClick={() => setCurrentFolder(crumb.id)}
                className="hover:underline"
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCreateFolderDialog(true)}
            className="text-[12px] h-8 border-[rgba(0,0,0,0.08)]"
          >
            + Folder
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/upload?modal=1")}
            className="text-[12px] h-8 bg-black text-white hover:bg-[#222] border-0"
          >
            Upload
          </Button>
          <div className="flex items-center border border-[rgba(0,0,0,0.08)] rounded ml-1">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-1.5 ${viewMode === "grid" ? "bg-[#f8f8f8]" : ""}`}
            >
              <Grid3X3 size={14} />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-1.5 ${viewMode === "list" ? "bg-[#f8f8f8]" : ""}`}
            >
              <List size={14} />
            </button>
          </div>
          <button
            onClick={() => setSortBy(sortBy === "date" ? "name" : sortBy === "name" ? "size" : "date")}
            className="flex items-center gap-1 text-[11px] text-[#888888] hover:text-black px-2 py-1"
          >
            <ArrowUpDown size={12} />
            {sortBy}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {/* Folders */}
        {sortedFolders.length > 0 && (
          <div className="mb-6">
            <h3 className="text-[10px] text-[#888888] uppercase tracking-[0.5px] mb-3">
              Folders ({sortedFolders.length})
            </h3>
            {viewMode === "grid" ? (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {sortedFolders.map((folder) => (
                  <div
                    key={folder.id}
                    onClick={() => setCurrentFolder(folder.id)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      toggleSelection(folder.id);
                    }}
                    className={`group flex flex-col items-center p-4 rounded border transition-all duration-200 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 ${
                      selectedItems.has(folder.id)
                        ? "border-black bg-[#f8f8f8]"
                        : "border-[rgba(0,0,0,0.08)] bg-white"
                    }`}
                  >
                    <Folder size={32} strokeWidth={1} className="mb-2 text-[#888888] group-hover:text-black transition-colors" />
                    <span className="text-[12px] truncate w-full text-center">{folder.name}</span>
                    <div onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className="mt-1 p-1 opacity-0 group-hover:opacity-100 hover:bg-[#f0f0f0] rounded transition-all"
                        >
                          <MoreVertical size={12} />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { setRenameDialog({ id: folder.id, type: "folder", name: folder.name }); setNewName(folder.name); }}>
                          <Edit3 size={12} className="mr-2" /> Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDelete(folder.id, "folder")}>
                          <Trash2 size={12} className="mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="border border-[rgba(0,0,0,0.08)] rounded divide-y divide-[rgba(0,0,0,0.04)]">
                {sortedFolders.map((folder) => (
                  <div
                    key={folder.id}
                    onClick={() => setCurrentFolder(folder.id)}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#f8f8f8] cursor-pointer transition-colors"
                  >
                    <Folder size={16} strokeWidth={1.5} className="text-[#888888]" />
                    <span className="flex-1 text-[13px]">{folder.name}</span>
                    <span className="text-[11px] text-[#888888]">{formatDate(folder.updatedAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Files */}
        {sortedFiles.length > 0 && (
          <div>
            <h3 className="text-[10px] text-[#888888] uppercase tracking-[0.5px] mb-3">
              Files ({sortedFiles.length})
            </h3>
            {viewMode === "grid" ? (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {sortedFiles.map((file) => (
                  <div
                    key={file.id}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      toggleSelection(file.id);
                    }}
                    className={`group relative p-4 rounded border transition-all duration-200 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 ${
                      selectedItems.has(file.id)
                        ? "border-black bg-[#f8f8f8]"
                        : "border-[rgba(0,0,0,0.08)] bg-white"
                    }`}
                  >
                    <div className="flex justify-center mb-2">
                      <FileIcon mimeType={file.mimeType} />
                    </div>
                    <div className="text-[12px] truncate text-center mb-1">{file.name}</div>
                    <div className="text-[10px] text-[#888888] text-center">
                      {formatBytes(file.size || 0)}
                    </div>
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="p-1 hover:bg-[#f0f0f0] rounded">
                            <MoreVertical size={12} />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => { setRenameDialog({ id: file.id, type: "file", name: file.name }); setNewName(file.name); }}>
                            <Edit3 size={12} className="mr-2" /> Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => navigate(`/shares/create?fileId=${file.id}`)}>
                            <Share2 size={12} className="mr-2" /> Share
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => navigate(`/versions?fileId=${file.id}`)}>
                            <Clock size={12} className="mr-2" /> Versions
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDelete(file.id, "file")}>
                            <Trash2 size={12} className="mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="border border-[rgba(0,0,0,0.08)] rounded divide-y divide-[rgba(0,0,0,0.04)]">
                {sortedFiles.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#f8f8f8] transition-colors group"
                  >
                    <FileIcon mimeType={file.mimeType} />
                    <span className="flex-1 text-[13px]">{file.name}</span>
                    <span className="text-[11px] text-[#888888] w-16 text-right">{formatBytes(file.size || 0)}</span>
                    <span className="text-[11px] text-[#888888] w-24 text-right">{formatDate(file.updatedAt)}</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-1 opacity-0 group-hover:opacity-100 hover:bg-[#f0f0f0] rounded">
                          <MoreVertical size={12} />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { setRenameDialog({ id: file.id, type: "file", name: file.name }); setNewName(file.name); }}>
                          <Edit3 size={12} className="mr-2" /> Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigate(`/shares/create?fileId=${file.id}`)}>
                          <Share2 size={12} className="mr-2" /> Share
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDelete(file.id, "file")}>
                          <Trash2 size={12} className="mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {sortedFolders.length === 0 && sortedFiles.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-[#888888]">
            <Folder size={48} strokeWidth={1} className="mb-4" />
            <p className="text-[14px] mb-2">This folder is empty</p>
            <p className="text-[12px] mb-4">Upload files or create folders to get started</p>
            <Button
              onClick={() => navigate("/upload?modal=1")}
              className="bg-black text-white hover:bg-[#222] text-[12px]"
            >
              Upload Files
            </Button>
          </div>
        )}
      </div>

      {/* Rename Dialog */}
      <Dialog open={!!renameDialog} onOpenChange={() => setRenameDialog(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-[14px] font-normal">Rename {renameDialog?.type}</DialogTitle>
          </DialogHeader>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Enter new name"
            className="text-[13px]"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setRenameDialog(null)} className="text-[12px]">
              Cancel
            </Button>
            <Button size="sm" onClick={handleRename} disabled={renameMutation.isPending} className="text-[12px] bg-black text-white">
              {renameMutation.isPending ? "Renaming..." : "Rename"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Folder Dialog */}
      <Dialog open={createFolderDialog} onOpenChange={setCreateFolderDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-[14px] font-normal">New Folder</DialogTitle>
          </DialogHeader>
          <Input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Folder name"
            className="text-[13px]"
            onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setCreateFolderDialog(false)} className="text-[12px]">
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreateFolder} disabled={createFolderMutation.isPending} className="text-[12px] bg-black text-white">
              {createFolderMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
