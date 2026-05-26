import { useState, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { trpc } from "@/providers/trpc";
import {
  UploadCloud,
  File,
  X,
  Pause,
  Play,
  Check,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

interface UploadFile {
  id: string;
  file: File;
  name: string;
  size: number;
  progress: number;
  status: "pending" | "uploading" | "paused" | "completed" | "error";
  sessionId?: number;
  speed: string;
  eta: string;
}

type UploadControl = {
  paused: boolean;
  cancelled: boolean;
};

const formatBytes = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function Upload() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isModal = searchParams.get("modal") === "1";
  const [uploads, setUploads] = useState<UploadFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadMode, setUploadMode] = useState<"files" | "folders">("files");
  const [folderId] = useState<number | undefined>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const controlsRef = useRef<Record<string, UploadControl>>({});
  const utils = trpc.useUtils();

  const createSession = trpc.upload.createSession.useMutation();
  const uploadChunk = trpc.upload.chunk.useMutation();
  const completeUpload = trpc.upload.complete.useMutation();
  const cancelUpload = trpc.upload.cancel.useMutation();

  const updateUpload = (id: string, next: Partial<UploadFile>) => {
    setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, ...next } : u)));
  };

  const processUpload = useCallback(
    async (upload: UploadFile) => {
      controlsRef.current[upload.id] = { paused: false, cancelled: false };

      try {
        const session = await createSession.mutateAsync({
          fileName: upload.name,
          fileSize: upload.size,
          mimeType: upload.file.type,
          folderId,
        });

        updateUpload(upload.id, {
          sessionId: session.sessionId,
          status: "uploading",
          speed: "0 KB/s",
          eta: "calculating...",
        });

        const chunkSize = session.chunkSize;
        const totalChunks = session.totalChunks;
        let uploadedBytes = 0;
        let lastTick = performance.now();

        for (let i = 0; i < totalChunks; i++) {
          const control = controlsRef.current[upload.id];
          if (control?.cancelled) {
            await cancelUpload.mutateAsync({ sessionId: session.sessionId });
            updateUpload(upload.id, { status: "error" });
            return;
          }

          while (controlsRef.current[upload.id]?.paused && !controlsRef.current[upload.id]?.cancelled) {
            await sleep(150);
          }

          const start = i * chunkSize;
          const end = Math.min(start + chunkSize, upload.file.size);
          const chunk = upload.file.slice(start, end);

          const reader = new FileReader();
          const base64Promise = new Promise<string>((resolve, reject) => {
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error("Failed to read file chunk"));
            reader.readAsDataURL(chunk);
          });

          const base64 = await base64Promise;
          await uploadChunk.mutateAsync({
            sessionId: session.sessionId,
            chunkIndex: i,
            data: base64,
          });

          uploadedBytes += chunk.size;
          const now = performance.now();
          const elapsedSeconds = Math.max((now - lastTick) / 1000, 0.001);
          lastTick = now;
          const speedBytesPerSecond = chunk.size / elapsedSeconds;
          const remainingBytes = upload.size - uploadedBytes;
          const etaSeconds = Math.max(Math.round(remainingBytes / Math.max(speedBytesPerSecond, 1)), 0);

          updateUpload(upload.id, {
            progress: Math.round(((i + 1) / totalChunks) * 100),
            speed: `${formatBytes(Math.round(speedBytesPerSecond))}/s`,
            eta: etaSeconds > 0 ? `${etaSeconds}s remaining` : "finalizing...",
          });
        }

        const result = await completeUpload.mutateAsync({ sessionId: session.sessionId });
        updateUpload(upload.id, {
          progress: 100,
          status: "completed",
          speed: "done",
          eta: "complete",
          sessionId: session.sessionId,
        });

        await Promise.all([
          utils.vault.list.invalidate(),
          utils.vault.stats.invalidate(),
          utils.upload.sessions.invalidate(),
        ]);

        toast.success(`${result.fileName} uploaded successfully`);
      } catch {
        updateUpload(upload.id, { status: "error", eta: "failed" });
        toast.error(`Failed to upload ${upload.name}`);
      }
    },
    [cancelUpload, completeUpload, createSession, folderId, uploadChunk, utils]
  );

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files) return;

      const newUploads: UploadFile[] = Array.from(files).map((file) => ({
        id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
        file,
        name: file.name,
        size: file.size,
        progress: 0,
        status: "pending" as const,
        speed: "0 KB/s",
        eta: "calculating...",
      }));

      setUploads((prev) => [...prev, ...newUploads]);

      for (const upload of newUploads) {
        void processUpload(upload);
      }
    },
    [processUpload]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const removeUpload = (id: string) => {
    setUploads((prev) => prev.filter((u) => u.id !== id));
  };

  const togglePause = (id: string) => {
    const control = controlsRef.current[id] || { paused: false, cancelled: false };
    controlsRef.current[id] = { ...control, paused: !control.paused };
    setUploads((prev) =>
      prev.map((u) =>
        u.id === id ? { ...u, status: u.status === "paused" ? "uploading" : "paused" } : u
      )
    );
  };

  const completedCount = uploads.filter((u) => u.status === "completed").length;
  const totalCount = uploads.length;


  const retryUpload = (upload: UploadFile) => {
    controlsRef.current[upload.id] = { paused: false, cancelled: false };
    updateUpload(upload.id, { progress: 0, status: "pending", speed: "0 KB/s", eta: "calculating..." });
    void processUpload(upload);
  };

  const content = (
    <div className="h-full overflow-y-auto px-8 py-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-start justify-between gap-4 mb-1">
          <h1 className="text-[24px] font-light tracking-[-0.3px]">Upload Files</h1>
          {isModal && (
            <button
              onClick={() => navigate("/vault")}
              className="p-2 rounded hover:bg-[#f0f0f0] transition-colors"
              aria-label="Close upload"
            >
              <X size={16} />
            </button>
          )}
        </div>
        <p className="text-[13px] text-[#888888] mb-6">
          Drag and drop files or click to browse. Supports large chunked uploads.
        </p>

        <div className="inline-flex rounded border border-[rgba(0,0,0,0.08)] mb-4 overflow-hidden">
          <button
            onClick={() => setUploadMode("files")}
            className={`px-3 py-1.5 text-[11px] ${uploadMode === "files" ? "bg-black text-white" : "bg-white text-[#888888]"}`}
          >
            Files
          </button>
          <button
            onClick={() => setUploadMode("folders")}
            className={`px-3 py-1.5 text-[11px] border-l border-[rgba(0,0,0,0.08)] ${uploadMode === "folders" ? "bg-black text-white" : "bg-white text-[#888888]"}`}
          >
            Folder
          </button>
        </div>

        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-all duration-300 mb-6 ${
            isDragging
              ? "border-black bg-[#f8f8f8]"
              : "border-[rgba(0,0,0,0.15)] hover:border-[rgba(0,0,0,0.3)] bg-white"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
            {...(uploadMode === "folders" ? ({ webkitdirectory: "" } as any) : {})}
          />
          <UploadCloud
            size={40}
            strokeWidth={1}
            className={`mx-auto mb-3 transition-colors ${isDragging ? "text-black" : "text-[#888888]"}`}
          />
          <p className="text-[14px] mb-1">{isDragging ? "Drop files here" : "Drag & drop files here"}</p>
          <p className="text-[12px] text-[#888888]">or click to browse</p>
        </div>

        {totalCount > 0 && (
          <div className="mb-4 p-3 bg-[#f8f8f8] rounded flex items-center justify-between">
            <span className="text-[12px]">
              {completedCount} of {totalCount} files uploaded
            </span>
            {completedCount === totalCount && totalCount > 0 && (
              <Button
                size="sm"
                onClick={() => navigate("/vault")}
                className="text-[11px] bg-black text-white hover:bg-[#222] h-7"
              >
                View in Vault
              </Button>
            )}
          </div>
        )}

        {uploads.length > 0 && (
          <div className="space-y-2">
            {uploads.map((upload) => (
              <div
                key={upload.id}
                className="flex items-center gap-3 p-3 bg-white border border-[rgba(0,0,0,0.08)] rounded"
              >
                <div className="p-2 bg-[#f8f8f8] rounded">
                  {upload.status === "completed" ? (
                    <Check size={16} className="text-green-600" />
                  ) : upload.status === "error" ? (
                    <AlertCircle size={16} className="text-red-500" />
                  ) : (
                    <File size={16} />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[12px] truncate">{upload.name}</span>
                    <span className="text-[10px] text-[#888888] ml-2">{formatBytes(upload.size)}</span>
                  </div>
                  <Progress value={upload.progress} className="h-1" />
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] text-[#888888]">{upload.progress}%</span>
                    <span className="text-[10px] text-[#888888]">{upload.speed}</span>
                    <span className="text-[10px] text-[#888888]">{upload.eta}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {upload.status === "uploading" && (
                    <button
                      onClick={() => togglePause(upload.id)}
                      className="p-1.5 hover:bg-[#f0f0f0] rounded transition-colors"
                    >
                      <Pause size={12} />
                    </button>
                  )}
                  {upload.status === "paused" && (
                    <button
                      onClick={() => togglePause(upload.id)}
                      className="p-1.5 hover:bg-[#f0f0f0] rounded transition-colors"
                    >
                      <Play size={12} />
                    </button>
                  )}
                  {(upload.status === "error" || upload.status === "completed") && (
                    <button
                      onClick={() => retryUpload(upload)}
                      className="p-1.5 hover:bg-[#f0f0f0] rounded transition-colors"
                      title="Retry"
                    >
                      <Play size={12} />
                    </button>
                  )}
                  <button
                    onClick={() => removeUpload(upload.id)}
                    className="p-1.5 hover:bg-red-50 hover:text-red-500 rounded transition-colors"
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
  if (isModal) {
    return (
      <Dialog open onOpenChange={() => navigate("/vault")}>
        <DialogContent className="max-w-[960px] p-0 overflow-hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>Upload Files</DialogTitle>
          </DialogHeader>
          {content}
        </DialogContent>
      </Dialog>
    );
  }

  return content;
}
