import { useState } from "react";
import { useParams } from "react-router";
import { trpc } from "@/providers/trpc";
import {
  File,
  Shield,
  Download,
  Lock,
  Loader2,
  AlertCircle,
  FileText,
  Image,
  Video,
  Music,
  Archive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

function FileIcon({ mimeType }: { mimeType?: string | null }) {
  if (!mimeType) return <File className="w-16 h-16 text-white/40" strokeWidth={1} />;
  if (mimeType.startsWith("image/")) return <Image className="w-16 h-16 text-blue-400" strokeWidth={1} />;
  if (mimeType.startsWith("video/")) return <Video className="w-16 h-16 text-purple-400" strokeWidth={1} />;
  if (mimeType.startsWith("audio/")) return <Music className="w-16 h-16 text-orange-400" strokeWidth={1} />;
  if (mimeType.includes("pdf")) return <FileText className="w-16 h-16 text-red-400" strokeWidth={1} />;
  if (mimeType.includes("zip") || mimeType.includes("archive"))
    return <Archive className="w-16 h-16 text-yellow-400" strokeWidth={1} />;
  return <File className="w-16 h-16 text-white/40" strokeWidth={1} />;
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export default function ShareLanding() {
  const { token } = useParams<{ token: string }>();
  const [password, setPassword] = useState("");
  const [isPasswordVerified, setIsPasswordVerified] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [verifyingPassword, setVerifyingPassword] = useState(false);

  const { data: shareData, isLoading, error, refetch } = trpc.share.access.useQuery(
    { token: token || "" },
    { enabled: !!token }
  );

  const verifyPasswordMutation = trpc.share.verifyPassword.useMutation();
  const logDownloadMutation = trpc.share.logDownload.useMutation();

  const handleVerifyPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim() || !token) return;
    setVerifyingPassword(true);
    setPasswordError("");

    try {
      const res = await verifyPasswordMutation.mutateAsync({
        token,
        password: password.trim(),
      });
      if (res.valid) {
        setIsPasswordVerified(true);
        refetch();
      } else {
        setPasswordError("Incorrect password. Please try again.");
      }
    } catch (err: any) {
      setPasswordError(err.message || "Failed to verify password");
    } finally {
      setVerifyingPassword(false);
    }
  };

  const handleDownload = async () => {
    if (!shareData?.resource || !token) return;
    const file = shareData.resource;

    try {
      // Concat all chunks from the mock file in-memory
      const chunks = (file as any).contentChunks || [];
      if (chunks.length === 0) {
        toast.error("File content is empty or unavailable.");
        return;
      }

      toast.info("Preparing download...");

      // Convert chunks to Blobs and trigger download
      const byteArrays = chunks.map((chunk: string) => {
        const base64Data = chunk.split(",")[1] || chunk;
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        return new Uint8Array(byteNumbers);
      });

      const blob = new Blob(byteArrays, { type: (file as any).mimeType || "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name || "download";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Log download to backend
      await logDownloadMutation.mutateAsync({ token });
      toast.success("Download started!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to reconstruct and download file");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-white/55" />
          <span className="text-[13px] font-light text-white/60">Fetching shared resource...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-6">
        <div className="max-w-md w-full p-8 bg-white/5 border border-white/10 rounded-lg text-center backdrop-blur-xl">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-light text-white mb-2">Link Invalid or Expired</h1>
          <p className="text-[13px] text-white/50 mb-6">
            {error.message || "This shared link could not be accessed. It might have been revoked, expired, or reached its download limit."}
          </p>
          <Button variant="outline" className="border-white/10 text-white hover:bg-white/5 text-[12px]" onClick={() => window.location.href = "/"}>
            Go to SharedPoint
          </Button>
        </div>
      </div>
    );
  }

  const showPasswordScreen = shareData?.requirePassword && !isPasswordVerified;

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-6 relative overflow-hidden">
      {/* Dynamic Background Gradients */}
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 30% 30%, rgba(0,229,255,0.2) 0%, transparent 50%), radial-gradient(circle at 70% 70%, rgba(147,51,234,0.2) 0%, transparent 50%)",
          }}
        />
      </div>

      <div className="max-w-md w-full z-10">
        {/* Logo header */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <Shield className="text-white w-6 h-6" strokeWidth={1.5} />
          <span className="text-white text-lg font-light tracking-[-0.3px]">SharedPoint</span>
        </div>

        {showPasswordScreen ? (
          /* Password Screen */
          <div className="p-8 bg-white/5 border border-white/10 rounded-lg backdrop-blur-xl">
            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-white/5 border border-white/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Lock className="w-5 h-5 text-white/60" />
              </div>
              <h2 className="text-lg font-light text-white mb-1">Password Protected</h2>
              <p className="text-[12px] text-white/50">Enter the password to access this shared file</p>
            </div>

            <form onSubmit={handleVerifyPassword} className="space-y-4">
              <div>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter link password"
                  className="bg-white/5 border-white/10 text-white placeholder-white/30 text-[13px] h-10 focus:border-white/30"
                  required
                  autoFocus
                />
                {passwordError && (
                  <p className="text-red-400 text-[11px] mt-1.5 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {passwordError}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                disabled={verifyingPassword || !password.trim()}
                className="w-full bg-white text-black hover:bg-white/90 text-[12px] h-10 font-medium"
              >
                {verifyingPassword ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Unlock File"
                )}
              </Button>
            </form>
          </div>
        ) : (
          /* Landing Screen (Download Link) */
          <div className="p-8 bg-white/5 border border-white/10 rounded-lg text-center backdrop-blur-xl">
            <div className="mb-6 flex justify-center">
              <div className="relative">
                <FileIcon mimeType={(shareData?.resource as any)?.mimeType} />
                <div className="absolute -bottom-1 -right-1 bg-white text-black w-6 h-6 rounded-full flex items-center justify-center border-2 border-black">
                  <Download className="w-3 h-3" />
                </div>
              </div>
            </div>

            <h2 className="text-lg font-light text-white mb-1 truncate px-2" title={shareData?.resource?.name}>
              {shareData?.resource?.name}
            </h2>
            <p className="text-[12px] text-white/50 mb-6">
              Size: {formatBytes((shareData?.resource as any)?.size || 0)}
              {shareData?.share.expiresAt && (
                <span className="block mt-1 text-[11px] text-white/40">
                  Expires: {new Date(shareData.share.expiresAt).toLocaleDateString()}
                </span>
              )}
            </p>

            <div className="space-y-3">
              <Button
                onClick={handleDownload}
                className="w-full bg-white text-black hover:bg-white/90 text-[13px] h-11 font-medium flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" /> Download File
              </Button>
              <p className="text-[10px] text-white/30">
                Shared securely via SharedPoint Permanent Encryption.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
